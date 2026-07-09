#!/usr/bin/env node

// Corpus test for the bash-guard hook. Feeds each command through the real hook
// on stdin and asserts the exit code (2 = blocked, 0 = allowed).
//
//   node plugins/bash-guard/test.mjs

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, 'hooks', 'guard.mjs');

// [command, shouldBlock, note]
const CASES = [
	// --- blocked: truncating pipes ---
	['seq 100 | head', true, 'plain head'],
	['seq 100 | tail -n 5', true, 'tail'],
	['cat f | less', true, 'pager less'],
	['cat f | more', true, 'pager more'],
	['ls | head | tail', true, 'later pipe stage still blocked'],
	['cat a | tee out | head', true, 'block after a passthrough stage'],
	['seq 100 | /usr/bin/head', true, 'absolute path'],
	['seq 100 | \\head', true, 'backslash-escaped name'],

	// --- blocked: wrappers and assignments before the command ---
	['seq 100 | sudo head', true, 'wrapper sudo'],
	['seq 100 | sudo -n head', true, 'wrapper with attached-value flag'],
	['seq 100 | env LC_ALL=C head', true, 'env with assignment'],
	['seq 100 | FOO=1 head', true, 'leading assignment'],

	// Known limitation: wrapper options that take a SEPARATE-word value
	// (e.g. `nice -n 5 head`) aren't parsed — the value word looks like the
	// command and we stop. Grammar-per-wrapper would be needed; not worth it
	// for a case that essentially never occurs after a pipe.
	['seq 100 | nice -n 5 head', false, 'KNOWN LIMITATION: separate-value option'],

	// --- blocked: line continuation ---
	['seq 100 | \\\nhead', true, 'backslash-newline continuation'],

	// --- blocked: shell -c recursion ---
	["bash -c 'seq 100 | head'", true, 'bash -c'],
	["sh -c 'seq 100 | head'", true, 'sh -c'],
	["foo && bash -c 'cat x | head'", true, 'bash -c after &&'],
	["seq 100 | bash -c 'cat | head'", true, 'bash -c after pipe'],
	["bash -ec 'seq 100 | head'", true, 'combined -ec flag'],
	["sudo bash -c 'seq 100 | head'", true, 'shell behind a wrapper'],
	["FOO=1 bash -c 'cat | head'", true, 'shell behind an assignment'],

	// --- blocked: filtering pipes hide the surrounding output ---
	['ps aux | grep node', true, 'grep filters what Claude sees'],
	['pnpm typecheck 2>&1 | grep -iE "error"', true, 'grep on build output'],
	['cat f | egrep foo', true, 'egrep alias'],
	['cat f | fgrep foo', true, 'fgrep alias'],
	['ls | rg node', true, 'ripgrep as a pipe filter'],
	['ps aux | sudo grep node', true, 'grep behind a wrapper'],
	["bash -c 'ps aux | grep node'", true, 'grep inside bash -c'],
	['cat f | grep a | grep b', true, 'later grep stage still blocked'],

	// --- allowed: pure reshaping tools are intentional ---
	['git ls-files | wc -l', false, 'wc is aggregation'],
	["find . -name '*.ts' | wc -l", false, 'wc count'],
	["git diff --name-only | sed 's/^/- /'", false, 'sed transform'],
	["cat f | awk '{print $1}'", false, 'awk transform'],
	['cat f | cut -d, -f1', false, 'cut'],
	['ls | sort | uniq', false, 'sort/uniq reshape without hiding status'],

	// --- allowed: grep as a primary command searches files (not a pipe sink) ---
	['grep -rn pattern src/', false, 'grep reads files, no pipe'],
	['rg -n TODO', false, 'ripgrep as a primary command'],

	// --- allowed: no pipe / head not fed by a pipe ---
	['head -n 5 file.txt', false, 'head reads a file, no pipe'],
	['echo hi', false, 'no pipe'],
	['cat a || head b', false, '|| is not a pipe'],

	// --- allowed: tokenizer edge cases (must not false-positive) ---
	['echo safe # | head', false, 'pipe is inside a comment'],
	["echo 'a | head'", false, 'pipe inside single quotes'],
	['echo "a | head"', false, 'pipe inside double quotes'],
	["echo bash -c 'x | head'", false, 'bash here is an argument, not a command'],

	// --- blocked: backgrounding & detaching (use run_in_background instead) ---
	['sleep 10 &', true, 'trailing background &'],
	['python server.py &', true, 'background a server'],
	['make build > log 2>&1 &', true, 'background with redirects'],
	['cmd & disown', true, 'background then disown'],
	['disown %1', true, 'disown in command position'],
	['setsid cmd', true, 'setsid detaches'],
	['coproc mycmd', true, 'coproc detaches'],
	['nohup cmd &', true, 'nohup with background &'],
	['sudo setsid cmd', true, 'detacher behind a wrapper'],
	['FOO=1 setsid cmd', true, 'detacher behind an assignment'],
	['(sleep 1 &)', true, 'background inside a subshell'],
	["bash -c 'sleep 10 &'", true, 'background inside bash -c'],

	// --- blocked: name/pattern-based mass kill (use TaskStop or `kill <pid>`) ---
	['pkill -f server', true, 'pkill by pattern'],
	['killall node', true, 'killall by name'],
	['sudo pkill xyz', true, 'pkill behind a wrapper'],
	['FOO=1 killall node', true, 'killall behind an assignment'],
	['cmd && pkill foo', true, 'pkill after &&'],
	["bash -c 'pkill foo'", true, 'pkill inside bash -c'],
	['/usr/bin/pkill foo', true, 'absolute path'],

	// --- allowed: precise kill and non-command uses (must not false-positive) ---
	['kill 1234', false, 'precise kill by pid is the sanctioned alternative'],
	['kill -9 1234', false, 'precise kill with signal'],
	['echo pkill', false, 'pkill is an argument, not a command'],
	["echo 'killall node'", false, 'kill command inside single quotes'],

	// --- allowed: & that is NOT backgrounding (must not false-positive) ---
	['a && b', false, 'logical AND, not background'],
	['cmd 2>&1', false, 'fd redirect 2>&1'],
	['cmd >&2', false, 'fd redirect to stderr'],
	['foo >& bar.log', false, '>& redirect to a file'],
	['cmd &>out.txt', false, '&> combined redirect'],
	['cmd &>>out.txt', false, '&>> combined append redirect'],
	['nohup cmd', false, 'bare nohup stays in foreground'],
	['seq 100 |& wc -l', false, '|& to a filter is allowed, not background'],
	["echo 'sleep 10 &'", false, 'background & inside single quotes'],
	['echo "a && b"', false, '&& inside double quotes'],
	["curl 'http://x/?a=1&b=2'", false, '& inside a quoted URL'],
];

function run(command) {
	return new Promise((resolve) => {
		const child = spawn('node', [HOOK], { stdio: ['pipe', 'ignore', 'ignore'] });
		child.on('close', (code) => resolve(code));
		child.stdin.end(JSON.stringify({ tool_input: { command } }));
	});
}

let failed = 0;
for (const [command, shouldBlock, note] of CASES) {
	const code = await run(command);
	const blocked = code === 2;
	const ok = blocked === shouldBlock;
	if (!ok) {
		failed++;
		const want = shouldBlock ? 'BLOCK' : 'ALLOW';
		const got = blocked ? 'BLOCK' : 'ALLOW';
		console.log(`FAIL  want ${want} got ${got}  ${JSON.stringify(command)}  (${note})`);
	}
}

if (failed) {
	console.log(`\n${failed}/${CASES.length} failed`);
	process.exit(1);
}
console.log(`All ${CASES.length} cases passed`);
