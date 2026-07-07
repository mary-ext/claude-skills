# Playwriter Interaction

## Clicking

```js
// Preferred: by locator (stable, auto-waits, no coordinates needed)
await state.page.locator('button[name="Submit"]').click();
await state.page.locator('text=Login').click({ button: 'right' });
await state.page.locator('text=Login').dblclick();
await state.page
	.locator('a')
	.first()
	.click({ modifiers: ['Meta'] }); // cmd+click opens link in new background tab

// By coordinates (when locators aren't available, e.g. canvas, maps, custom widgets)
await state.page.mouse.click(450, 320); // left click
await state.page.mouse.click(450, 320, { button: 'right' }); // right click
await state.page.mouse.dblclick(450, 320); // double click
await state.page.mouse.click(450, 320, { clickCount: 3 }); // triple click
await state.page.mouse.click(450, 320, { modifiers: ['Shift'] }); // shift+click
```

### Antipattern: Using force or dispatchEvent

`dispatchEvent(new MouseEvent(...))`, `{ force: true }`, and `element.click()` inside
`page.evaluate()` bypass Playwright checks but **do not trigger React/Vue/Svelte handlers** — state
won't update. Use snapshot to find the real interactive element:

```js
// WRONG — bypasses framework handlers
await state.page.evaluate(() => document.querySelector('.btn').click());

// RIGHT
await state.page.getByRole('radio', { name: 'Node.js' }).click();
```

## Hover

```js
await state.page.locator('.tooltip-trigger').hover(); // by locator (preferred)
await state.page.mouse.move(450, 320); // by coordinates
```

## Scroll

```js
// By locator (preferred)
await state.page.locator('#footer').scrollIntoViewIfNeeded();

// By pixel (for canvas, maps, infinite scroll)
await state.page.mouse.wheel(0, 300); // scroll down 300px
await state.page.mouse.wheel(0, -300); // scroll up
await state.page.mouse.wheel(300, 0); // scroll right
await state.page.mouse.wheel(-300, 0); // scroll left

// Scroll at a specific position
await state.page.mouse.move(450, 320);
await state.page.mouse.wheel(0, 500);

// Scroll inside a container
await state.page.locator('.scrollable-list').evaluate((el) => {
	el.scrollTop += 500;
});
```

## Drag

```js
// By locator (preferred)
await state.page.locator('#item').dragTo(state.page.locator('#target'));

// By coordinates (for canvas, sliders, custom drag targets)
await state.page.mouse.move(100, 200);
await state.page.mouse.down();
await state.page.mouse.move(400, 500, { steps: 10 }); // steps for smooth drag
await state.page.mouse.up();
```

**Freehand drawing, annotation widgets, and canvas tools** use this same `mouse.down → move → up`
pattern. If a widget expects a drawn stroke, always use held-mouse motion — not `mouse.click()`:

```js
// Draw a stroke across a canvas or annotation layer
await state.page.mouse.move(startX, startY);
await state.page.mouse.down();
await state.page.mouse.move(endX, endY, { steps: 15 }); // steps = smoother stroke
await state.page.mouse.up();
await state.page.waitForTimeout(500); // let the widget process the stroke
```

## Typing

```js
await state.page.keyboard.type('my text');
```

**Text concatenation without line breaks:** `keyboard.type()` doesn't insert newlines from `\n` in
strings. Use `keyboard.press('Enter')` between lines:

```js
await state.page.keyboard.type('Line 1');
await state.page.keyboard.press('Enter');
await state.page.keyboard.type('Line 2');
```

## Key Hold / Release / Repeat

```js
// Hold modifier while pressing another key
await state.page.keyboard.down('Shift');
await state.page.keyboard.press('ArrowDown');
await state.page.keyboard.up('Shift');

// Repeat a key
for (let i = 0; i < 5; i++) await state.page.keyboard.press('ArrowDown');
```

## File Uploads

For file uploads, prefer file input over clipboard paste:

```js
// Reliable: use file input
const fileInput = state.page.locator('input[type="file"]').first();
await fileInput.setInputFiles('/path/to/image.png');

// Unreliable: clipboard paste may silently fail
await state.page.keyboard.press('Meta+v'); // always verify with snapshot!
```

## Taking Screenshots

Always use `scale: 'css'` to avoid 2-4x larger images on high-DPI displays:

```js
await state.page.screenshot({ path: '/absolute/path/to/shot.png', scale: 'css' });
```

If you want to read back the image file into context, resize it first so it consumes fewer tokens:

```js
await resizeImageForAgent({ input: '/absolute/path/to/shot.png' });
```

### Region Screenshot (Zoom Equivalent)

```js
await state.page.screenshot({
	path: '/absolute/path/to/region.png',
	scale: 'css',
	clip: { x: 100, y: 200, width: 400, height: 300 },
});
```

## Resize Viewport

```js
await state.page.setViewportSize({ width: 1280, height: 720 });
```

## Preferred Actions

Prefer locator-based actions over coordinates — locators are stable across scroll/resize, auto-wait
for elements, and don't require screenshot round-trips that burn ~800 image tokens per cycle.

## Antipattern: Not Verifying Actions

Always check page state after important actions (form submissions, uploads, typing). Your mental
model can diverge from actual browser state:

```js
await state.page.keyboard.type('my text');
await snapshot({ page: state.page, search: /my text/ });
// Verify with deterministic values, not by eyeballing a screenshot — see observation.md
```
