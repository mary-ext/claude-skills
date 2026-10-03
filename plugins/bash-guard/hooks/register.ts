import type { Register } from 'claude-code';

import { analyze, denyMessage } from './guard.ts';

export const register: Register = (on) => {
	on('tool.call', { tool: 'Bash' }, ($, e, next) => {
		const blocked = analyze(e.command);
		return blocked ? { deny: denyMessage(blocked) } : next(e);
	});
};
