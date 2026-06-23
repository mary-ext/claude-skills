# Playwriter Advanced

## getCDPSession

Send raw CDP commands:

```js
const cdp = await getCDPSession({ page: state.page })
const metrics = await cdp.send('Page.getLayoutMetrics')
```

## getLocatorStringForElement

Get stable Playwright selector from an element:

```js
const selector = await getLocatorStringForElement(state.page.locator('[id="submit-btn"]'))
// => "getByRole('button', { name: 'Save' })"
```

## getReactSource

Get React component source location (dev mode only):

```js
const source = await getReactSource({ locator: state.page.locator('[data-testid="submit-btn"]') })
// => { fileName, lineNumber, columnNumber, componentName }
```

## getReactComponentInfo

Best-effort React component info for an element — richer than `getReactSource` (adds the component hierarchy and sanitized props). Returns `null` for non-React elements and never throws just because an element wasn't rendered by React. Source locations are usually only available in dev builds; props are sanitized and truncated (functions, DOM nodes, circular refs, and huge objects are stripped) so they don't flood output.

```js
const info = await getReactComponentInfo({ locator: state.page.locator('[data-testid="submit-btn"]') })
// => { componentName, source, hierarchy, props } | null
```

## getStylesForLocator

Inspect CSS styles applied to an element, like browser DevTools "Styles" panel. Useful for debugging styling issues, finding where a CSS property is defined (file:line), and checking inherited styles. Returns selector, source location, and declarations for each matching rule. ALWAYS fetch `https://playwriter.dev/resources/styles-api.md` first with curl or webfetch tool.

```js
const styles = await getStylesForLocator({
  locator: state.page.locator('.btn'),
  cdp: await getCDPSession({ page: state.page }),
})
console.log(formatStylesAsText(styles))
```

## createDebugger

Set breakpoints, step through code, inspect variables at runtime. Useful for debugging issues that only reproduce in browser, understanding code flow, and inspecting state at specific points. Can pause on exceptions, evaluate expressions in scope, and blackbox framework code. ALWAYS fetch `https://playwriter.dev/resources/debugger-api.md` first.

```js
const cdp = await getCDPSession({ page: state.page })
const dbg = createDebugger({ cdp })
await dbg.enable()
const scripts = await dbg.listScripts({ search: 'app' })
await dbg.setBreakpoint({ file: scripts[0].url, line: 42 })
// when paused: dbg.inspectLocalVariables(), dbg.stepOver(), dbg.resume()
```

## createEditor

View and live-edit page scripts and CSS at runtime. Edits are in-memory (persist until reload). Useful for testing quick fixes, searching page scripts with grep, and toggling debug flags. ALWAYS read `https://playwriter.dev/resources/editor-api.md` first.

```js
const cdp = await getCDPSession({ page: state.page })
const editor = createEditor({ cdp })
await editor.enable()
const matches = await editor.grep({ regex: /console\.log/ })
await editor.edit({ url: matches[0].url, oldString: 'DEBUG = false', newString: 'DEBUG = true' })
```

## Pinned Elements

Users can right-click → "Copy Playwriter Element Reference" to store elements in `globalThis.playwriterPinnedElem1` (increments for each pin). The reference is copied to clipboard:

```js
const el = await state.page.evaluateHandle(() => globalThis.playwriterPinnedElem1)
await el.click()
```

Inspect a pinned element — prints its `outerHTML` plus React component info when available (the same flow behind the in-page toolbar and right-click copy):

```js
await inspectPinnedElement('https://example.com', 'globalThis.playwriterPinnedElem1')
```

## Ghost Browser Integration

When running in [Ghost Browser](https://ghostbrowser.com/), the `chrome` object exposes APIs for multi-identity automation (identities, proxies, sessions). See `extension/src/ghost-browser-api.d.ts` for full API reference. Only works in Ghost Browser — calls fail in regular Chrome.
