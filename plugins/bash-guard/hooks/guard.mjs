#!/usr/bin/env node

// const BLOCK = new Set(['head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg']);

const DETACH = new Set(['disown', 'setsid', 'coproc']);

const KILL = new Set(['pkill', 'killall']);

const WAIT = new Set(['sleep']);

// Transparent command wrappers.
const WRAPPERS = new Set(['sudo', 'command', 'env', 'nice', 'time', 'stdbuf', 'nohup', 'builtin', 'exec']);

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash']);

// Operators that start a simple command. Redirections are excluded.
const CMD_START_OPS = new Set(['|', '||', '|&', '&', '&&', ';', ';;', ';&', ';;&', '(']);

// Reserved words that expect a command next.
const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'while', 'until', 'do', '{', '!']);

// const PIPE_OPS = new Set(['|', '|&']);

// The word after a redirection is a target, not a command.
const REDIR_OPS = new Set(['<', '<&', '<<', '<<-', '<<<', '>', '>&', '>>', '>|', '&>', '&>>']);

// `<<<` is a here-string, not a heredoc.
const HEREDOC_OPS = new Set(['<<', '<<-']);

// Other backslashes inside double quotes remain literal.
const DQUOTE_ESCAPES = new Set(['"', '\\', '$', '`']);

const basename = (w) => (w.includes('/') ? w.slice(w.lastIndexOf('/') + 1) : w);
const isAssignment = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);

// Match the longest operator at `cmd[i]`.
function matchOp(cmd, i) {
	const c = cmd[i];
	const c2 = cmd[i + 1];
	const c3 = cmd[i + 2];
	switch (c) {
		case '|':
			if (c2 === '&') return { value: '|&', len: 2 };
			if (c2 === '|') return { value: '||', len: 2 };
			return { value: '|', len: 1 };
		case '&':
			if (c2 === '>' && c3 === '>') return { value: '&>>', len: 3 };
			if (c2 === '>') return { value: '&>', len: 2 };
			if (c2 === '&') return { value: '&&', len: 2 };
			return { value: '&', len: 1 };
		case ';':
			if (c2 === ';' && c3 === '&') return { value: ';;&', len: 3 };
			if (c2 === ';') return { value: ';;', len: 2 };
			if (c2 === '&') return { value: ';&', len: 2 };
			return { value: ';', len: 1 };
		case '>':
			if (c2 === '&') return { value: '>&', len: 2 };
			if (c2 === '>') return { value: '>>', len: 2 };
			if (c2 === '|') return { value: '>|', len: 2 };
			return { value: '>', len: 1 };
		case '<':
			// `<>` can be treated as repeated `<` for classification.
			if (c2 === '&') return { value: '<&', len: 2 };
			if (c2 === '<' && c3 === '<') return { value: '<<<', len: 3 };
			if (c2 === '<' && c3 === '-') return { value: '<<-', len: 3 };
			if (c2 === '<') return { value: '<<', len: 2 };
			return { value: '<', len: 1 };
		case '(':
		case ')':
			return { value: c, len: 1 };
		default:
			return null;
	}
}

// Skip pending heredoc bodies after a newline.
function skipHeredocBodies(cmd, i, heredocs) {
	for (const { delim, stripTabs } of heredocs) {
		while (i < cmd.length) {
			let eol = cmd.indexOf('\n', i);
			if (eol === -1) eol = cmd.length;
			const line = cmd.slice(i, eol);
			i = Math.min(eol + 1, cmd.length);
			if ((stripTabs ? line.replace(/^\t+/, '') : line) === delim) break;
		}
	}
	return i;
}

// Tokenize shell words and operators, skipping heredoc bodies.
function tokenize(cmd) {
	const tokens = [];
	let word = '';
	// Preserve empty quoted words.
	let hasWord = false;
	let heredocs = [];
	let heredocOp = null;
	const pushWord = () => {
		if (hasWord) {
			if (heredocOp) {
				heredocs.push({ delim: word, stripTabs: heredocOp === '<<-' });
				heredocOp = null;
			}
			tokens.push({ type: 'word', value: word });
			word = '';
			hasWord = false;
		}
	};

	let i = 0;
	const n = cmd.length;
	while (i < n) {
		const c = cmd[i];
		if (c === "'") {
			hasWord = true;
			i++;
			while (i < n && cmd[i] !== "'") {
				word += cmd[i];
				i++;
			}
			i++;
			continue;
		}
		if (c === '"') {
			hasWord = true;
			i++;
			while (i < n && cmd[i] !== '"') {
				if (cmd[i] === '\\' && i + 1 < n) {
					const next = cmd[i + 1];
					if (next === '\n') {
						i += 2;
					} else if (DQUOTE_ESCAPES.has(next)) {
						word += next;
						i += 2;
					} else {
						word += cmd[i];
						i++;
					}
				} else {
					word += cmd[i];
					i++;
				}
			}
			i++;
			continue;
		}
		if (c === '\\') {
			if (i + 1 < n) {
				if (cmd[i + 1] === '\n') {
					i += 2;
				} else {
					word += cmd[i + 1];
					hasWord = true;
					i += 2;
				}
			} else {
				i++;
			}
			continue;
		}
		if (c === '#' && !hasWord) {
			while (i < n && cmd[i] !== '\n') i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
			pushWord();
			i++;
			if (c === '\n' && heredocs.length) {
				i = skipHeredocBodies(cmd, i, heredocs);
				heredocs = [];
			}
			continue;
		}
		const op = matchOp(cmd, i);
		if (op) {
			pushWord();
			tokens.push({ type: 'op', value: op.value });
			if (HEREDOC_OPS.has(op.value)) heredocOp = op.value;
			i += op.len;
			continue;
		}
		word += c;
		hasWord = true;
		i++;
	}
	pushWord();
	return tokens;
}

// Yield each simple command's starting token.
function* commandStarts(tokens) {
	let atStart = true;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].type === 'op') {
			atStart = CMD_START_OPS.has(tokens[i].value);
			continue;
		}
		if (atStart && KEYWORDS.has(tokens[i].value)) continue;
		if (atStart) yield i;
		atStart = false;
	}
}

// Resolve a command past assignments and wrappers.
function resolveCommand(tokens, start) {
	let inWrapper = false;
	for (let j = start; j < tokens.length; j++) {
		const tk = tokens[j];
		if (tk.type === 'op') {
			if (tk.value === '(') continue;
			return null;
		}
		if (isAssignment(tk.value)) continue;
		const name = basename(tk.value);
		if (WRAPPERS.has(name)) {
			inWrapper = true;
			continue;
		}
		if (inWrapper && tk.value.startsWith('-')) continue;
		return { name, index: j };
	}
	return null;
}

// function firstBlockedPipe(tokens) {
// 	for (let i = 0; i < tokens.length; i++) {
// 		const t = tokens[i];
// 		if (t.type !== 'op' || !PIPE_OPS.has(t.value)) continue;
// 		const cmd = resolveCommand(tokens, i + 1);
// 		if (cmd && BLOCK.has(cmd.name)) return { kind: 'pipe', name: cmd.name };
// 	}
// 	return null;
// }

function firstDetach(tokens) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (cmd && DETACH.has(cmd.name)) return { kind: 'detach', name: cmd.name };
	}
	return null;
}

// Block mass-kill commands and `kill` jobspecs.
function firstKill(tokens) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (!cmd) continue;
		if (KILL.has(cmd.name)) return { kind: 'kill', name: cmd.name };
		if (cmd.name === 'kill') {
			for (let j = cmd.index + 1; j < tokens.length; j++) {
				const tk = tokens[j];
				if (tk.type === 'op') break;
				if (tk.value.startsWith('%')) return { kind: 'kill', name: 'kill' };
			}
		}
	}
	return null;
}

function firstWait(tokens) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (cmd && WAIT.has(cmd.name)) return { kind: 'wait', name: cmd.name };
	}
	return null;
}

// Find `&` after a command, excluding redirection syntax.
function firstBackground(tokens) {
	let sawCmdWord = false;
	let expectRedirTarget = false;
	for (const t of tokens) {
		if (t.type === 'op') {
			if (t.value === '&') {
				if (sawCmdWord) return { kind: 'background' };
				sawCmdWord = false;
				expectRedirTarget = false;
				continue;
			}
			if (REDIR_OPS.has(t.value)) {
				expectRedirTarget = true;
				continue;
			}
			if (CMD_START_OPS.has(t.value)) {
				sawCmdWord = false;
			}
			expectRedirTarget = false;
			continue;
		}
		if (expectRedirTarget) {
			expectRedirTarget = false;
			continue;
		}
		sawCmdWord = true;
	}
	return null;
}

// Inspect `<shell> -c <string>` recursively.
function firstBlockedShellC(tokens, depth) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (!cmd || !SHELLS.has(cmd.name)) continue;
		for (let j = cmd.index + 1; j < tokens.length; j++) {
			const tk = tokens[j];
			if (tk.type === 'op') break;
			if (tk.value !== '-c' && !/^-[A-Za-z]*c$/.test(tk.value)) continue;
			const arg = tokens[j + 1];
			if (arg?.type !== 'word') continue;
			const nested = analyze(arg.value, depth + 1);
			if (nested) return nested;
		}
	}
	return null;
}

function analyze(cmd, depth = 0) {
	if (depth > 5) return null;
	const tokens = tokenize(cmd);
	return (
		// firstBlockedPipe(tokens) ||
		firstDetach(tokens) ||
		firstKill(tokens) ||
		firstBackground(tokens) ||
		firstWait(tokens) ||
		firstBlockedShellC(tokens, depth)
	);
}

function denyMessage(result) {
	switch (result.kind) {
		// case 'pipe': {
		// 	return `Drop \`| ${result.name}\` from the command. When the output is long, Claude Code saves the full result to a file that can be read from`;
		// }
		case 'background':
		case 'detach': {
			return `Use Bash(run_in_background: true) to run a command in the background`;
		}
		case 'kill': {
			return `Use TaskStop to stop a command you started with Bash(run_in_background: true), or \`kill <pid>\` for any other process`;
		}
		case 'wait': {
			return `Drop \`${result.name}\`. Claude Code provides much more suitable tools for this purpose`;
		}
	}
}

async function readStdin() {
	let data = '';
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

const raw = await readStdin();
let payload;
try {
	payload = JSON.parse(raw || '{}');
} catch {
	process.exit(0);
}

const command = payload?.tool_input?.command;
if (typeof command !== 'string' || !command.trim()) process.exit(0);

const blocked = analyze(command);
if (!blocked) process.exit(0);

process.stderr.write(denyMessage(blocked));
process.exit(2);
