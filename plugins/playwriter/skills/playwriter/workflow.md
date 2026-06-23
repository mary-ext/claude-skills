# Playwriter Core Workflow

## Context Variables

Available in every execute call:

- `state` — object persisted between calls **within your session**. Use to store pages, data, listeners (e.g., `state.page = await context.newPage()`)
- `page` — a default page (may be shared with other agents). Prefer creating your own page and storing it in `state`
- `context` — browser context, access all pages via `context.pages()`
- `require` — load Node.js modules (e.g., `const fs = require('node:fs')`). ESM `import` is not available
- Node.js globals: `setTimeout`, `setInterval`, `fetch`, `URL`, `Buffer`, `crypto`, etc.

**Important:** `state` is **session-isolated** but pages are **shared** across all sessions. See `navigation.md` for how to avoid interference.

## Core Rules

- **Initialize `state.page` first**: at the start of a task, assign `state.page` (reuse `about:blank` or create one) and use it for all steps. See `navigation.md`.
- **Multiple calls**: use multiple execute calls for complex logic — helps understand intermediate state and isolate which action failed.
- **Never close**: never call `browser.close()` or `context.close()`. Only close pages you created or if user asks.
- **No bringToFront**: interact with background pages directly — `bringToFront` is disruptive. Only call it if the user asks.
- **Check state after actions**: verify page state after clicking/submitting — your mental model can diverge from actual browser state.
- **Clean up listeners**: call `state.page.removeAllListeners()` at end of message to prevent leaks.
- **CDP sessions**: use `getCDPSession({ page: state.page })`. `newCDPSession()` fails through the playwriter relay.
- **Absolute paths for artifacts**: pass an absolute path to every API that writes a file — `page.screenshot({ path })`, `locator.screenshot`, `elementHandle.screenshot`, `page.pdf({ path })`, `download.saveAs()`, `video.saveAs()`, `resizeImageForAgent`. Relative paths are resolved by Playwright client internals against the relay server's cwd, not the sandboxed `fs` (your session cwd), so they silently land in the wrong directory.
- **Wait for load**: use `state.page.waitForLoadState('domcontentloaded')` not `state.page.waitForEvent('load')` — waitForEvent times out if already loaded.
- **Minimize timeouts**: prefer proper waits (`waitForSelector`, `waitForPageLoad`) over `state.page.waitForTimeout()`. Short timeouts (1-2s) are acceptable for non-deterministic events like animations, tab opens, or async UI updates where no specific selector is available.
- **Read state with `snapshot()`**: it's text-based, fast, and cheap — use it to read page state and verify actions. You can't judge fine visual detail from a screenshot yourself, so don't reach for one to check whether a page loaded or something looks right. See `observation.md`.
- **Snapshot replaces page.evaluate() for inspection**: do NOT write `page.evaluate()` calls to manually query class names, bounding boxes, child counts, or visibility flags. `snapshot()` already shows every interactive element with its text, role, and a ready-to-use locator. If you catch yourself writing `document.querySelector` or `getBoundingClientRect` inside evaluate — stop and use `snapshot()` instead. Reserve `page.evaluate()` for actions that modify page state (e.g., `localStorage.clear()`, scroll manipulation) or extract non-DOM data (e.g., `window.__CONFIG__`).
- **Collaborate with the user**: they can help with captchas, difficult elements, or reproducing bugs. Ask when stuck rather than burning context on workarounds.

## Interaction Feedback Loop

Every browser interaction must follow **observe → act → observe**. Never chain multiple actions blindly.

1. **Open page** — get or create your page, navigate to URL
2. **Observe** — print `state.page.url()` + `snapshot()`. Always print URL — pages can redirect unexpectedly.
3. **Check** — if page isn't ready (loading, wrong URL, content missing), wait and observe again
4. **Act** — perform one action (click, type, submit)
5. **Observe again** — print URL + snapshot to verify the action's effect
6. **Repeat** from step 3 until task is complete

```js
// Step 1: navigate + observe
state.page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage())
await state.page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
console.log('URL:', state.page.url())
await snapshot({ page: state.page }).then(console.log)
```

```js
// Step 2: act + observe
await state.page.locator('button:has-text("Submit")').click()
console.log('URL:', state.page.url())
await snapshot({ page: state.page }).then(console.log)
```

If nothing changed after an action, try `waitForPageLoad({ page: state.page, timeout: 3000 })` or you may have clicked the wrong element.

### Deeper Observation

When snapshots aren't enough to understand what happened, combine multiple channels:

```js
// Check console for errors after an action
const errors = await getLatestLogs({ page: state.page, search: /error|fail/i, count: 20 })

// Combine snapshot + logs for full picture
const snap = await snapshot({ page: state.page, search: /dialog|error|message/ })
const logs = await getLatestLogs({ page: state.page, search: /error/i, count: 10 })
console.log('UI:', snap)
console.log('Logs:', logs)
```

Use `getLatestLogs()` for console errors, `state.page.url()` for navigation, and `snapshot()` for UI state (see `observation.md`).

## Bash Quoting

Single-quote the `-e` argument. Bash expands `$`, backticks, and `\` inside double quotes — silently corrupting JS code.

```bash
npx playwriter@latest -s 1 -e 'await state.page.click("button")'
```

For multiline code or code containing single quotes, use a heredoc with a quoted delimiter (disables all bash expansion):

```bash
npx playwriter@latest -s 1 -e "$(cat <<'EOF'
const links = await state.page.$$eval('a', els => els.map(e => e.href));
console.log(links);
EOF
)"
```

Avoid `$'...'` — `\n`, `\t`, `\\` become special and clash with JS regex patterns.

## Execute from File

For longer scripts, run `-f` with a file path instead of `-e` — it sidesteps bash quoting entirely. Same sandbox, same context variables (`state`, `page`, `context`, …). `-e` and `-f` cannot be combined.

```bash
npx playwriter@latest -s 1 -f script.js
```
