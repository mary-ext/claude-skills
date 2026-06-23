# Playwriter Scraping & Data Extraction

## page.evaluate

Code inside `page.evaluate()` runs in the browser — use plain JavaScript only, no TypeScript syntax. Return values and log outside (console.log inside evaluate runs in browser, not visible):

```js
const title = await state.page.evaluate(() => document.title)
console.log('Title:', title)

const info = await state.page.evaluate(() => ({
  url: location.href,
  buttons: document.querySelectorAll('button').length,
}))
console.log(info)
```

## Loading Files

Fill inputs with file content:

```js
const fs = require('node:fs')
const content = fs.readFileSync('./data.txt', 'utf-8')
await state.page.locator('textarea').fill(content)
```

## Network Interception

For scraping or reverse-engineering APIs, intercept network requests instead of scrolling DOM. Store in `state` to analyze across calls:

```js
state.requests = []
state.responses = []
state.page.on('request', (req) => {
  if (req.url().includes('/api/')) state.requests.push({ url: req.url(), method: req.method(), headers: req.headers() })
})
state.page.on('response', async (res) => {
  if (res.url().includes('/api/')) {
    try {
      state.responses.push({ url: res.url(), status: res.status(), body: await res.json() })
    } catch {}
  }
})
```

Then trigger actions (scroll, click, navigate) and analyze captured data:

```js
console.log('Captured', state.responses.length, 'API calls')
state.responses.forEach((r) => console.log(r.status, r.url.slice(0, 80)))
```

Inspect a specific response to understand schema:

```js
const resp = state.responses.find((r) => r.url.includes('users'))
console.log(JSON.stringify(resp.body, null, 2).slice(0, 2000))
```

Replay API directly (useful for pagination):

```js
const { url, headers } = state.requests.find((r) => r.url.includes('feed'))
const data = await state.page.evaluate(
  async ({ url, headers }) => {
    const res = await fetch(url, { headers })
    return res.json()
  },
  { url, headers },
)
console.log(data)
```

Clean up listeners when done:

```js
state.page.removeAllListeners('request')
state.page.removeAllListeners('response')
```

## Authenticated Fetches

Fetch from within page context to include session cookies automatically:

```js
const data = await state.page.evaluate(async (url) => {
  const resp = await fetch(url)
  return await resp.text()
}, 'https://example.com/protected/resource')
```

## Read Page Cookies via CDP

Use `Network.getCookies` on the page CDP session:

```js
const cdp = await getCDPSession({ page: state.page })
const { cookies } = await cdp.send('Network.getCookies', { urls: [state.page.url()] })
console.log(cookies)
```

MUST use this for page-scoped cookies in extension mode. `Storage.getCookies` is a root-session command and will fail in playwriter.

## Downloading Large Data

Console output truncates large strings. Trigger a browser download instead:

```js
// Fetch protected data and trigger download to user's Downloads folder
await state.page.evaluate(async (url) => {
  const resp = await fetch(url)
  const data = await resp.text()
  const blob = new Blob([data], { type: 'application/octet-stream' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'data.json'
  a.click()
}, 'https://example.com/protected/large-file')
// File saves to ~/Downloads - read it from there
```

## Avoid Permission-Gated Browser APIs

Some APIs require user permission prompts or special browser flags. These often fail silently or hang. Examples to avoid:

- `navigator.clipboard.writeText()` — requires permission
- Multiple concurrent downloads — browser may block
- `window.showSaveFilePicker()` — requires user gesture
- Geolocation, camera, microphone APIs

Instead, use simpler alternatives (single download via `a.click()`, store data in `state`, etc).

## Capture Downloads

```js
const [download] = await Promise.all([state.page.waitForEvent('download'), state.page.click('button.download')])
await download.saveAs(`/absolute/path/${download.suggestedFilename()}`)
```

## Extracting and Downloading Media

Use `page.evaluate()` to extract URLs from the rendered DOM, then download via Node.js in the sandbox. This is far more reliable than parsing raw HTML:

```js
// Extract all image URLs from rendered DOM
const images = await state.page.evaluate(() =>
  Array.from(document.querySelectorAll('img[src]')).map((img) => ({
    src: img.src,
    alt: img.alt,
    width: img.naturalWidth,
  })),
)
console.log(JSON.stringify(images, null, 2))

// Download a specific image to disk
const fs = require('node:fs')
const resp = await fetch(images[0].src)
const buf = Buffer.from(await resp.arrayBuffer())
fs.writeFileSync('./downloaded-image.jpg', buf)
console.log('Saved', buf.length, 'bytes')
```

For carousels or lazy-loaded galleries, you may need to click navigation arrows or scroll first, then re-extract. Use network interception to capture high-resolution CDN URLs that may differ from the `img.src` thumbnails.

## getCleanHTML

Get cleaned HTML from a locator or page, with search and diffing:

```js
await getCleanHTML({ locator, search?, showDiffSinceLastCall?, includeStyles? })
// Examples:
const html = await getCleanHTML({ locator: state.page.locator('body') })
const html = await getCleanHTML({ locator: state.page, search: /button/i })
const fullHtml = await getCleanHTML({ locator: state.page, showDiffSinceLastCall: false })
```

**Parameters:**

- `locator` — Playwright Locator or Page to get HTML from
- `search` — string/regex to filter results (returns first 10 matching lines with 5 lines context)
- `showDiffSinceLastCall` — returns diff since last call (default: `true`, but `false` when `search` is provided). Pass `false` to get full HTML.
- `includeStyles` — keep style and class attributes (default: false)

Cleans HTML automatically: removes script/style/svg/head tags, unwraps empty wrappers, removes empty elements, truncates long values. Keeps semantic attributes (`href`, `name`, `type`, `aria-*`, `data-*`).

## getPageMarkdown

Extract main page content as plain text using Mozilla Readability (same algorithm as Firefox Reader View). Strips navigation, ads, sidebars, and other clutter. Returns formatted text with title, author, and content:

```js
await getPageMarkdown({ page: state.page, search?, showDiffSinceLastCall? })
// Examples:
const content = await getPageMarkdown({ page: state.page, showDiffSinceLastCall: false })  // full article
const matches = await getPageMarkdown({ page: state.page, search: /API/i })  // search within content
```

**Output format:**

```
# Article Title

Author: John Doe | Site: example.com | Published: 2024-01-15

> Article excerpt or description

The main article content as plain text, with paragraphs preserved...
```

**Parameters:**

- `page` — Playwright Page to extract content from
- `search` — string/regex to filter content (returns first 10 matching lines with 5 lines context)
- `showDiffSinceLastCall` — returns diff since last call (default: `true`, but `false` when `search` is provided). Pass `false` to get full content.
