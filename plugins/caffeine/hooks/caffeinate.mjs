#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { basename, join } from 'node:path';

// A running tool fires no hooks, so the hold can't be refreshed mid-call: it must
// outlast a long build. Process death (`-w` / `kill -0`) is the real release; this is
// just the backstop for when no event ever arrives.
const TIMEOUT = Number(process.env.CC_CAFFEINE_TIMEOUT_SECONDS) || 14400; // 4h
// Ease off at a turn boundary rather than hard-dropping — releasing an already-idle
// machine sleeps it instantly.
const GRACE = Number(process.env.CC_CAFFEINE_GRACE_SECONDS) || 90;
const STATE_DIR = join(tmpdir(), 'cc-caffeine');
const DEBUG = !!process.env.CC_CAFFEINE_DEBUG;

function debug(msg) {
	if (!DEBUG) return;
	try {
		appendFileSync(join(STATE_DIR, 'debug.log'), `${new Date().toISOString()} ${msg}\n`);
	} catch {}
}

// Usually comm/argv[0] is just `claude` (native, npm, mise). The official installer is
// the exception: its binary is named e.g. `2.1.207`, matched by its `.../share/claude/
// versions/...` path. Match argv[0] only — globbing the whole command would match this
// hook's own path and identify itself as Claude.
function looksLikeClaude(comm, args) {
	const argv0 = (args || '').trim().split(/\s+/)[0] || '';
	const names = [comm, argv0].map((s) => basename(s || ''));
	return (
		names.includes('claude') ||
		names.includes('claude-code') ||
		/\/share\/claude\/versions\//.test(`${comm} ${argv0}`)
	);
}

// One process snapshot per invocation, shared by every lookup below: a live hook fires
// several ps calls otherwise, and a single -A read is also tear-free (no reparenting
// between per-pid reads). pid -> { ppid, comm, args }.
function snapshot() {
	const { stdout } = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' });
	const procs = new Map();
	for (const line of (stdout || '').split('\n')) {
		const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*))?$/);
		if (m) procs.set(Number(m[1]), { ppid: Number(m[2]), comm: m[3], args: m[4] || '' });
	}
	return procs;
}

// Walk up from the hook's shell to the long-lived `claude` process.
function claudePid(procs) {
	let pid = process.ppid;
	for (let i = 0; i < 14 && pid > 1; i++) {
		const p = procs.get(pid);
		if (!p) return null;
		if (looksLikeClaude(p.comm, p.args)) return pid;
		pid = p.ppid;
	}
	return null;
}

// Platform inhibitor held for `secs`, bound to ccPid so it dies with Claude.
function inhibitor(ccPid, secs) {
	if (platform() === 'darwin') {
		const args = ['-i', '-t', String(secs)];
		if (ccPid) args.push('-w', String(ccPid));
		return { cmd: 'caffeinate', args };
	}
	const holder = ccPid
		? `i=0; while [ $i -lt ${secs} ]; do kill -0 ${ccPid} 2>/dev/null || exit 0; sleep 5; i=$((i+5)); done`
		: `sleep ${secs}`;
	return {
		cmd: 'systemd-inhibit',
		args: [
			'--what=idle:sleep',
			'--who=Claude Code',
			'--why=Claude Code is working',
			'--mode=block',
			'sh',
			'-c',
			holder,
		],
	};
}

function isOurs(procs, pid) {
	const p = procs.get(pid);
	return !!p && /caffeinate|systemd-inhibit/.test(p.args);
}

// Live inhibitors bound to this ccPid, for reaping strays leaked by concurrent events.
// The match is anchored on the pid: unanchored, pid 5016 would also match (and kill)
// another Claude's inhibitor at 50162.
function inhibitorsFor(procs, ccPid) {
	if (!ccPid) return [];
	const match =
		platform() === 'darwin'
			? (cmd) => /caffeinate\b/.test(cmd) && new RegExp(`\\s-w\\s+${ccPid}(?:\\s|$)`).test(cmd)
			: (cmd) => new RegExp(`kill -0 ${ccPid}(?:\\s|$)`).test(cmd);
	const pids = [];
	for (const [pid, p] of procs) {
		if (match(p.args)) pids.push(pid);
	}
	return pids;
}

function killGroup(pid) {
	try {
		process.kill(-pid, 'SIGTERM');
	} catch {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {}
	}
}

function stop(procs, pidFile) {
	let pid;
	try {
		pid = Number(readFileSync(pidFile, 'utf8').trim());
	} catch {
		return;
	}

	if (pid > 0 && isOurs(procs, pid)) killGroup(pid);

	try {
		rmSync(pidFile);
	} catch {}
}

function start(pidFile, ccPid, secs) {
	const { cmd, args } = inhibitor(ccPid, secs);
	const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
	child.on('error', () => {});
	child.unref();
	if (child.pid) writeFileSync(pidFile, String(child.pid));
}

// Hold duration by event: full while working, a grace at a turn boundary, nothing once
// the session ends. Two events look like releases but aren't:
//   SubagentStop     — fires mid-turn; subagent tool calls already renew via the
//                      parent's Pre/PostToolUse. Not wired.
//   permission_prompt — the approved tool hasn't run yet and nothing fires until it
//                      finishes, so releasing would sleep the machine mid-build. A
//                      follow-up idle_prompt covers a genuine walk-away.
function holdSeconds(payload) {
	switch (payload.hook_event_name) {
		case 'SessionEnd':
			return 0;
		case 'Stop':
			return GRACE;
		case 'Notification':
			return payload.notification_type === 'idle_prompt' || payload.notification_type === 'agent_needs_input'
				? GRACE
				: TIMEOUT;
		default:
			return TIMEOUT; // UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure
	}
}

async function readStdin() {
	let data = '';
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

try {
	const payload = JSON.parse((await readStdin()) || '{}');
	const key = String(payload.session_id ?? `pid-${process.ppid}`).replace(/[^A-Za-z0-9_-]/g, '');

	mkdirSync(STATE_DIR, { recursive: true });

	const pidFile = join(STATE_DIR, `${key}.pid`);
	const procs = snapshot();
	const ccPid = claudePid(procs);
	const secs = holdSeconds(payload);
	debug(
		`event=${payload.hook_event_name} notif=${payload.notification_type ?? ''} ccPid=${ccPid ?? 'NONE'} hold=${secs}s`,
	);

	for (const pid of inhibitorsFor(procs, ccPid)) killGroup(pid);
	stop(procs, pidFile);

	if (secs > 0) start(pidFile, ccPid, secs);
} catch (err) {
	debug(`error: ${err?.message ?? err}`);
}

// Exit clean and silent: UserPromptSubmit stdout would be injected as context.
process.exit(0);
