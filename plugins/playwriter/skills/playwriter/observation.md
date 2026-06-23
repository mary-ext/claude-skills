# Playwriter Observation

## Accessibility Snapshots

```js
await snapshot({ page: state.page, search?, showDiffSinceLastCall? })
```

- `search` — string/regex to filter results (returns first 10 matching lines)
- `showDiffSinceLastCall` — returns diff since last snapshot (default: `true`, but `false` when `search` is provided). Pass `false` to get full snapshot.

Snapshots return full content on first call, then diffs on subsequent calls. Diff is only returned when shorter than full content. If nothing changed, returns "No changes since last snapshot". Use `showDiffSinceLastCall: false` to always get full content. When `search` is provided, diffing is disabled by default — pass `showDiffSinceLastCall: true` explicitly to combine both. This diffing behavior also applies to `getCleanHTML` and `getPageMarkdown`.

Example output:

```md
- banner:
  - link "Home" [id="nav-home"]
  - navigation:
    - link "Docs" [data-testid="docs-link"]
    - link "Blog" role=link[name="Blog"]
```

Each interactive line ends with a Playwright locator you can pass to `state.page.locator()`. If multiple elements share the same locator, a `>> nth=N` suffix is added (0-based) to make it unique.

### Use Snapshot Locators Directly

**Use snapshot locators directly — never invent selectors.** The snapshot output IS the selector. Do not guess CSS selectors or `getByText` when the snapshot already gives you the exact match:

```js
// Snapshot shows: role=radio[name="Nope, Vanilla"]  →  use it directly
await state.page.getByRole('radio', { name: 'Nope, Vanilla' }).click()
// Snapshot shows: role=link[name="SIGN IN"]  →  or pass raw string to locator()
await state.page.locator('role=link[name="SIGN IN"]').click()
```

**Beware CSS text-transform**: snapshots show visual text (`heading "NODE.JS"`) but DOM may be `"Node.js"`. Use case-insensitive regex: `getByRole('heading', { name: /node\.js/i })`.

### Ref Labels

If a screenshot shows ref labels like `e3`, resolve them using the last snapshot:

```js
const snap = await snapshot({ page: state.page })
const locator = refToLocator({ ref: 'e3' })
await state.page.locator(locator!).click()
```

### Scoping Snapshots

Pass a `locator` instead of `page` to snapshot only a subtree. This dramatically reduces output size when you only care about one section:

```js
// Full page snapshot: ~150 lines
await snapshot({ page: state.page })

// Scoped to main: ~20 lines
await snapshot({ locator: state.page.locator('main') })

// Scope to a specific form, dialog, or section
await snapshot({ locator: state.page.locator('[role="dialog"]') })
await snapshot({ locator: state.page.locator('form#checkout') })
```

Use this whenever the full page snapshot is dominated by navigation or layout elements you don't need. It saves significant tokens and makes the output much easier to parse.

### Filtering Large Snapshots in JS

When `search` isn't enough, filter the string directly:

```js
const snap = await snapshot({ page: state.page })
const filtered = snap.split('\n').filter(l => l.includes('dialog') || l.includes('error')).join('\n')
```

### Antipattern: Using Stale Locators

Locators (especially ones with `>> nth=`) can change when the page updates. Always get a fresh snapshot before clicking, then immediately use locators from that output:

```js
await snapshot({ page: state.page, showDiffSinceLastCall: true })
// Now use the NEW locators from this output
```

## Choosing Between Observation Methods

Use `snapshot` for text-heavy pages (forms, articles) — fast, cheap, searchable. Use `screenshotWithAccessibilityLabels` for complex visual layouts (grids, galleries, dashboards) where spatial position matters. Both share the same ref system and can be combined.

## screenshotWithAccessibilityLabels

Take a screenshot with Vimium-style visual labels overlaid on interactive elements. Shows labels, captures screenshot, then removes labels. The image and accessibility snapshot are automatically included in the response. Can be called multiple times. Use a timeout of **20 seconds** for complex pages.

This is only for **finding interactive elements** on the page. To share a screenshot with the user or save an image, use `page.screenshot()` + `resizeImageForAgent()` instead.

Prefer this for pages with grids, image galleries, maps, or complex visual layouts where spatial position matters. For simple text-heavy pages, `snapshot` with search is faster and uses fewer tokens.

```js
await screenshotWithAccessibilityLabels({ page: state.page })
// Use refs from snapshot to interact with elements
await state.page.locator('[id="submit-btn"]').click()

// Can take multiple screenshots in one execution
await screenshotWithAccessibilityLabels({ page: state.page })
await state.page.click('button')
await screenshotWithAccessibilityLabels({ page: state.page })
```

Labels are color-coded: yellow=links, orange=buttons, coral=inputs, pink=checkboxes, peach=sliders, salmon=menus, amber=tabs.

## resizeImageForAgent

Shrink an image so it consumes fewer tokens when read back into context. The resized image is automatically included in the response. Also accepts `width`, `height`, `maxDimension`, `quality`, `format` (default: `'png'`), `output`. Alias: `resizeImage`.

```js
await resizeImageForAgent({ input: '/absolute/path/to/screenshot.png' })
```

## getLatestLogs

Retrieve captured browser console logs (up to 5000 per page, cleared on navigation):

```js
await getLatestLogs({ page?, count?, search? })
// Examples:
const errors = await getLatestLogs({ search: /error/i, count: 50 })
const pageLogs = await getLatestLogs({ page: state.page })
```

For custom log collection across runs, store in state:

```js
state.logs = []; state.page.on('console', m => state.logs.push(m.text()))
```

## waitForPageLoad

Smart load detection that ignores analytics/ads:

```js
await waitForPageLoad({ page: state.page, timeout?, pollInterval?, minWait? })
// Returns: { success, readyState, pendingRequests, waitTimeMs, timedOut }
```

## Selector Best Practices

**For unknown websites**: use `snapshot()` — it shows what's actually interactive with stable locators.

**For development** (when you have source code access), prefer stable selectors in this order:

1. **Best**: `[data-testid="submit"]` — explicit test attributes, never change accidentally
2. **Good**: `getByRole('button', { name: 'Save' })` — accessible, semantic
3. **Good**: `getByText('Sign in')`, `getByLabel('Email')` — readable, user-facing
4. **OK**: `input[name="email"]`, `button[type="submit"]` — semantic HTML
5. **Avoid**: `.btn-primary`, `#submit` — classes/IDs change frequently
6. **Last resort**: `div.container > form > button` — fragile, breaks easily

Combine locators for precision:

```js
state.page.locator('tr').filter({ hasText: 'John' }).locator('button').click()
state.page.locator('button').nth(2).click()
```

If a locator matches multiple elements, Playwright throws "strict mode violation". Use `.first()`, `.last()`, or `.nth(n)`:

```js
await state.page.locator('button').first().click() // first match
await state.page.locator('.item').last().click() // last match
await state.page.locator('li').nth(3).click() // 4th item (0-indexed)
```

## Antipattern: Judging Appearance from Screenshots

You can't read fine visual detail from a screenshot. You can't tell whether an element is a few pixels out of place, whether spacing or alignment is slightly off, or which of two near-identical renders is the right one — comparing screenshots by eye misses real differences and invents false ones. So don't reach for a screenshot to decide whether something *looks right* or whether a visual change took effect. Check state and confirm changes with deterministic values instead:

```js
await snapshot({ page: state.page, search: /expected text/i })    // text / structure
await snapshot({ page: state.page, showDiffSinceLastCall: true }) // structural diff
const color = await el.evaluate(n => getComputedStyle(n).color)   // computed style
const box = await el.boundingBox()                               // { x, y, width, height }
```

For true pixel regression testing, use a dedicated image-diff tool (e.g. Playwright's `toHaveScreenshot()`), not visual comparison in context.

(`screenshotWithAccessibilityLabels` for *finding* interactive elements is fine — see above. And if the user asks for a screenshot to look at themselves, that's a normal request: `page.screenshot()` + `resizeImageForAgent()`. The limit is on *you* judging appearance from an image, not on producing one.)
