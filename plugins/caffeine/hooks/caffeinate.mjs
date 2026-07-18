#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

// Safety-net lifetime — refreshed on each activity event, so it only bites when
// a release event never arrives (e.g. a crash).
const TIMEOUT = Number(process.env.CC_CAFFEINE_TIMEOUT_SECONDS) || 900;

// Events that mean "Claude is idle now" — everything else refreshes.
const RELEASE = new Set(['Notification', 'Stop', 'SessionEnd', 'SubagentStop']);

const STATE_DIR = join(tmpdir(), 'cc-caffeine');

// Walk up to the long-lived `claude` process: process.ppid is the short-lived
// shell the hook runs under, not Claude, and we tie the inhibitor to Claude.
function claudePid() {
	let pid = process.ppid;
	for (let i = 0; i < 12 && pid > 1; i++) {
		const { stdout } = spawnSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' });
		const m = (stdout || '').trim().match(/^(\d+)\s+(.*)$/);
		if (!m) return null;
		const comm = m[2].trim();
		if (comm === 'claude' || comm.endsWith('/claude')) return pid;
		pid = Number(m[1]);
	}
	return null;
}

// The native inhibitor for this platform. Given ccPid, it also exits the moment
// Claude's process dies, so a crash releases the lock at once rather than
// lingering until TIMEOUT.
function inhibitor(ccPid) {
	if (platform() === 'darwin') {
		const args = ['-i', '-t', String(TIMEOUT)];
		if (ccPid) args.push('-w', String(ccPid));
		return { cmd: 'caffeinate', args };
	}
	// Poll for the pid in portable sh (no bash-only $SECONDS) so the child exits
	// early if Claude disappears, else falls through to the TIMEOUT bound.
	const holder = ccPid
		? `i=0; while [ $i -lt ${TIMEOUT} ]; do kill -0 ${ccPid} 2>/dev/null || exit 0; sleep 5; i=$((i+5)); done`
		: `sleep ${TIMEOUT}`;
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

// Confirm the pid is still one of our inhibitors, so a recycled pid never takes
// down an unrelated process.
function isOurs(pid) {
	const { stdout } = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
	return /caffeinate|systemd-inhibit/.test(stdout || '');
}

function stop(pidFile) {
	let pid;
	try {
		pid = Number(readFileSync(pidFile, 'utf8').trim());
	} catch {
		return; // no inhibitor recorded
	}

	if (pid > 0 && isOurs(pid)) {
		try {
			process.kill(-pid, 'SIGTERM');
		} catch {
			try {
				process.kill(pid, 'SIGTERM');
			} catch {}
		}
	}

	try {
		rmSync(pidFile);
	} catch {}
}

function start(pidFile) {
	const { cmd, args } = inhibitor(claudePid());
	const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
	child.on('error', () => {}); // native tool missing → silently no-op
	child.unref();
	if (child.pid) writeFileSync(pidFile, String(child.pid));
}

async function readStdin() {
	let data = '';
	for await (const chunk of process.stdin) data += chunk;
	return data;
}

try {
	const payload = JSON.parse((await readStdin()) || '{}');
	const key = String(payload.session_id).replace(/[^A-Za-z0-9_-]/g, '');

	mkdirSync(STATE_DIR, { recursive: true });

	const pidFile = join(STATE_DIR, `${key}.pid`);

	if (RELEASE.has(payload.hook_event_name)) {
		stop(pidFile);
	} else {
		stop(pidFile); // drop the old inhibitor, then start a fresh one (refresh)
		start(pidFile);
	}
} catch {}

// Never block Claude and never print to stdout (UserPromptSubmit stdout would be
// injected as context).
process.exit(0);
