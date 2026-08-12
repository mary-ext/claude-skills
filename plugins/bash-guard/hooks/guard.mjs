#!/usr/bin/env node

// Commands that, when fed by a pipe, hide part of what Claude sees.
const BLOCK = new Set(['head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg']);

// Commands that detach a process from the harness.
const DETACH = new Set(['disown', 'setsid', 'coproc']);

// Commands that mass-kills processes.
const KILL = new Set(['pkill', 'killall']);

// Transparent wrappers to look past when they precede a command, e.g.
// `... | sudo head` or `sudo setsid cmd`.
const WRAPPERS = new Set(['sudo', 'command', 'env', 'nice', 'time', 'stdbuf', 'nohup', 'builtin', 'exec']);

// Shells whose `-c <string>` argument is itself a command line we must inspect,
// so `bash -c 'seq 100 | head'` can't smuggle a truncating pipe past us.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash']);

// Operators after which the next word starts a new simple command. Redirections
// (`>`, `>&`, `&>`, ...) are deliberately excluded: they take a target word, they
// don't begin a new command.
const CMD_START_OPS = new Set(['|', '||', '|&', '&', '&&', ';', ';;', ';&', ';;&', '(']);

// Pipe operators that feed one command's output into the next.
const PIPE_OPS = new Set(['|', '|&']);

// Redirection operators. Their following word is a target (a filename, an fd, a
// heredoc delimiter, or a here-string) — not a command — and their `&` (in `>&`,
// `<&`, `&>`, `&>>`) is fd duplication, never backgrounding.
const REDIR_OPS = new Set(['<', '<&', '<<', '<<-', '<<<', '>', '>&', '>>', '>|', '&>', '&>>']);

// Heredoc operators, whose target word names the terminator of a body that the
// tokenizer must skip. `<<<` is a here-string (a plain word), not a heredoc.
const HEREDOC_OPS = new Set(['<<', '<<-']);

// Characters a backslash escapes inside double quotes (others stay literal).
const DQUOTE_ESCAPES = new Set(['"', '\\', '$', '`']);

const basename = (w) => (w.includes('/') ? w.slice(w.lastIndexOf('/') + 1) : w);
const isAssignment = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);

// Longest-match operator recognizer. Given the command and an index, return the
// operator token starting there ({ value, len }) or null. Multi-char forms are
// matched first so a bare `&` (backgrounding) is only ever the fallback after
// `&&` (and), `&>`/`&>>` (redirect), `|&` (pipe-both), and `>&`/`<&` (fd dup).
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
			// `<>` falls through as repeated `<`; it takes a target word like `<`
			// does, so the distinction never affects classification.
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

// Skip the bodies of the heredocs opened on the line that just ended. `i` points
// just past that newline. Each body runs to a line holding only its delimiter
// (leading tabs stripped when opened with `<<-`); an unterminated body runs to
// the end of the input. Returns the index to resume tokenizing at.
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

// Split a shell command into word/operator tokens, respecting quotes and
// backslash escapes. Operators are recognized by longest match so each `&`,
// `|`, `>`, `<`, `;` variant is an unambiguous token. Heredoc bodies are data,
// not commands, so they are skipped rather than tokenized — otherwise a script
// written with `cat <<EOF ... EOF` would be judged on the text it writes.
function tokenize(cmd) {
	const tokens = [];
	let word = '';
	// Tracks a pending word even when empty, so `''` emits a real empty token.
	let hasWord = false;
	// Heredocs opened on the current line, in the order their bodies follow.
	let heredocs = [];
	// Set to `<<`/`<<-` while the next word is that operator's delimiter.
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
			// single quotes: everything literal until the next '
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
			// double quotes: backslash only escapes $ ` " \ and newline
			hasWord = true;
			i++;
			while (i < n && cmd[i] !== '"') {
				if (cmd[i] === '\\' && i + 1 < n) {
					const next = cmd[i + 1];
					if (next === '\n') {
						i += 2; // line continuation, disappears
					} else if (DQUOTE_ESCAPES.has(next)) {
						word += next;
						i += 2;
					} else {
						word += cmd[i]; // backslash is literal here
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
					i += 2; // line continuation, disappears
				} else {
					// escaped char joins the current word (e.g. \grep -> grep)
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
			// comment: skip to end of line
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

// Yield the token index that starts each simple command: the start of the input
// and the first token after every command-separating operator.
function* commandStarts(tokens) {
	let atStart = true;
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].type === 'op') {
			atStart = CMD_START_OPS.has(tokens[i].value);
			continue;
		}
		if (atStart) yield i;
		atStart = false;
	}
}

// Resolve the real command word at command position `start`, looking past a
// leading `(`, env assignments, and wrappers together with their flags. Returns
// { name, index } of that word, or null when the segment holds no command word
// (e.g. it is only a redirection).
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
		// a wrapper's flags come before the wrapped command (e.g. `nice -n 5 head`)
		if (inWrapper && tk.value.startsWith('-')) continue;
		return { name, index: j };
	}
	return null;
}

// Return { kind: "pipe", name } for the first blocked command that a real pipe
// feeds into, or null if no pipeline stage is blocked.
function firstBlockedPipe(tokens) {
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.type !== 'op' || !PIPE_OPS.has(t.value)) continue;
		const cmd = resolveCommand(tokens, i + 1);
		if (cmd && BLOCK.has(cmd.name)) return { kind: 'pipe', name: cmd.name };
	}
	return null;
}

// Return { kind: "detach", name } for the first detaching command in command
// position (`disown`, `setsid`, `coproc`), or null.
function firstDetach(tokens) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (cmd && DETACH.has(cmd.name)) return { kind: 'detach', name: cmd.name };
	}
	return null;
}

// Return { kind: "kill", name } for the first mass-kill command in command
// position (`pkill`, `killall`), or a `kill` targeting a jobspec (`%1`) — job
// control we ban regardless of whether it hits anything — or null.
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

// Return { kind: "background", name: "&" } if a real backgrounding `&` follows a
// command, or null. A `&` only backgrounds when a command word precedes it in
// its segment; a redirect target word (after `>`, `>&`, ...) doesn't count.
function firstBackground(tokens) {
	let sawCmdWord = false;
	// A redirect target (the word after `>`, `>&`, ...) is not a command, so it
	// must not make a following `&` look like it backgrounds a real command.
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

// Find `<shell> -c <string>` invocations in command position and inspect the
// string recursively, so a truncating pipe or detach inside `bash -c '...'` is
// caught too.
function firstBlockedShellC(tokens, depth) {
	for (const i of commandStarts(tokens)) {
		const cmd = resolveCommand(tokens, i);
		if (!cmd || !SHELLS.has(cmd.name)) continue;
		for (let j = cmd.index + 1; j < tokens.length; j++) {
			const tk = tokens[j];
			if (tk.type === 'op') break;
			// -c, or a combined short-flag group ending in c (e.g. -ec)
			if (tk.value !== '-c' && !/^-[A-Za-z]*c$/.test(tk.value)) continue;
			const arg = tokens[j + 1];
			if (arg?.type !== 'word') continue;
			const nested = analyze(arg.value, depth + 1);
			if (nested) return nested;
		}
	}
	return null;
}

// Return the first block result for `cmd` ({ kind, name }), or null.
function analyze(cmd, depth = 0) {
	if (depth > 5) return null; // guard against pathological nesting
	const tokens = tokenize(cmd);
	return (
		firstBlockedPipe(tokens) ||
		firstDetach(tokens) ||
		firstKill(tokens) ||
		firstBackground(tokens) ||
		firstBlockedShellC(tokens, depth)
	);
}

function denyMessage(result) {
	switch (result.kind) {
		case 'pipe': {
			return `Drop \`| ${result.name}\` from the command. When the output is long, Claude Code saves the full result to a file that can be read from`;
		}
		case 'background':
		case 'detach': {
			return `Use Bash(run_in_background: true) to run a command in the background`;
		}
		case 'kill': {
			return `Use TaskStop to stop a command you started with Bash(run_in_background: true), or \`kill <pid>\` for any other process`;
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
