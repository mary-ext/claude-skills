#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const TIMEOUT = Number(process.env.CC_CAFFEINE_TIMEOUT_SECONDS) || 900;
const RELEASE = new Set(['Notification', 'Stop', 'SessionEnd', 'SubagentStop']);
const STATE_DIR = join(tmpdir(), 'cc-caffeine');

// Walk up from the hook's shell to the long-lived `claude` process.
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

// Native inhibitor for this platform, bound to ccPid so it releases when Claude dies.
function inhibitor(ccPid) {
	if (platform() === 'darwin') {
		const args = ['-i', '-t', String(TIMEOUT)];
		if (ccPid) args.push('-w', String(ccPid));
		return { cmd: 'caffeinate', args };
	}
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

function isOurs(pid) {
	const { stdout } = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
	return /caffeinate|systemd-inhibit/.test(stdout || '');
}

// Every running inhibitor bound to this Claude pid, so we can reap strays leaked
// by concurrent events or by earlier sessions in the same Claude process.
function inhibitorsFor(ccPid) {
	if (!ccPid) return [];
	const { stdout } = spawnSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8' });
	const match = platform() === 'darwin'
		? (cmd) => /caffeinate\b/.test(cmd) && new RegExp(`\\s-w\\s+${ccPid}(?:\\s|$)`).test(cmd)
		: (cmd) => cmd.includes(`kill -0 ${ccPid}`);
	const pids = [];
	for (const line of (stdout || '').split('\n')) {
		const m = line.trim().match(/^(\d+)\s+(.*)$/);
		if (m && match(m[2])) pids.push(Number(m[1]));
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

function stop(pidFile) {
	let pid;
	try {
		pid = Number(readFileSync(pidFile, 'utf8').trim());
	} catch {
		return;
	}

	if (pid > 0 && isOurs(pid)) killGroup(pid);

	try {
		rmSync(pidFile);
	} catch {}
}

function start(pidFile, ccPid) {
	const { cmd, args } = inhibitor(ccPid);
	const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
	child.on('error', () => {});
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
	const ccPid = claudePid();

	for (const pid of inhibitorsFor(ccPid)) killGroup(pid);
	stop(pidFile);

	if (!RELEASE.has(payload.hook_event_name)) {
		start(pidFile, ccPid);
	}
} catch {}

// Exit clean and silent: UserPromptSubmit stdout would be injected as context.
process.exit(0);
