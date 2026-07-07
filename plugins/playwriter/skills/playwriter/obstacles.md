# Playwriter Obstacles

## Use Playwriter Directly for JS-Rendered Sites

For SPAs (Instagram, Twitter, Facebook, etc.), `webfetch`, `curl`, and Playwright CLI screenshots
return empty HTML shells with no content. Skip them entirely and go straight to playwriter:

```js
state.page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage());
await state.page.goto('https://www.instagram.com/p/ABC123/', { waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page: state.page, timeout: 8000 });
await snapshot({ page: state.page, search: /cookie|consent|accept/i }).then(console.log);
```

Then dismiss obstacles (see below) and extract via `snapshot()`, `getPageMarkdown()`, or
`page.evaluate()`.

## Handling Page Obstacles

Most major websites show blocking overlays (cookie modals, login walls, age gates). Always check for
these with `snapshot()` right after navigation and dismiss them before doing anything else:

```js
// After navigating, check for common obstacles
await waitForPageLoad({ page: state.page, timeout: 5000 });
const snap = await snapshot({
	page: state.page,
	search: /cookie|consent|accept|reject|decline|allow|age|verify|login|sign.in/i,
});
console.log(snap);
// Look for dismiss/accept/decline buttons in the snapshot, then click them:
// await state.page.locator('button:has-text("Accept")').click();
// await state.page.locator('button:has-text("Decline optional")').click();
// Then re-snapshot to confirm the modal is gone before proceeding
```

If the page requires login and the user is already logged into Chrome, their session cookies are
available — just navigate and the page should load authenticated. If not, ask the user for help or
use their existing logged-in tab via `context.pages()`.

## Click Times Out or Does Nothing — Snapshot to Find the Blocker

When a click times out, a **modal or overlay** is likely intercepting pointer events. Do not retry
with different selectors or `{ force: true }` — snapshot to find the blocker:

```js
// click timed out → don't retry blindly, find what's blocking
await snapshot({ page: state.page, search: /dialog|modal/i });
// Found modal → interact with it properly (don't just close via X, it may reappear)
await state.page.getByRole('radio', { name: 'Nope, Vanilla' }).click();
```

## Wrong Assumptions About Current Page/Element

Before destructive actions (delete, submit), verify you're targeting the right thing:

```js
// Before deleting, verify it's the right item
await screenshotWithAccessibilityLabels({ page: state.page });
// READ the screenshot to confirm, THEN proceed with delete
```

## Assuming Page Content Loaded

Even after `goto()`, dynamic content may not be ready:

```js
await state.page.goto('https://example.com');
// Content may still be loading via JavaScript!
await state.page.waitForSelector('article', { timeout: 10000 });
// Or use waitForPageLoad utility
await waitForPageLoad({ page: state.page, timeout: 5000 });
```

## Try Patterns Before Investigating DOM Internals

When a click does nothing, snapshot to see every interactive element, then try a different
interaction pattern. Save DOM-internals investigation (CDP listeners, React fibers, canvas pixels,
evaluate-based class queries) for after 2–3 correct patterns produce no response — they burn massive
context to find what `snapshot()` already shows.

1. Take a `snapshot()` — it shows every interactive element and what to click
2. Try a different interaction pattern if `click()` didn't work:
   - **Drawing/annotation tools, canvas paint** → `mouse.down`, move with steps, `mouse.up` (see
     `interaction.md`)
   - **Keyboard-activated modes** → press the shortcut key (snapshot shows tooltip text like "Draw
     mode D")
   - **Sliders, timeline scrubbers** → drag pattern
   - **Collapsed/toggled toolbars** → click the toggle first, wait, then interact
3. Take another `snapshot()` to see what changed
4. Only investigate DOM internals if correct interaction patterns produce zero response after 2–3
   attempts
