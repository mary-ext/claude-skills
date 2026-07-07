# Playwriter Navigation

## Working with Pages

**Pages are shared, state is not.** `context.pages()` returns all browser tabs with playwriter
enabled — shared across all sessions. Multiple agents see the same tabs. If another agent navigates
or closes a page you're using, you'll be affected. To avoid interference, **get your own page**.

### Get or Create Your Page (First Call)

On your very first execute call, reuse an existing empty tab or create a new one, and navigate it
**in the same execute call**. Store it in `state` and use `state.page` for all subsequent operations
instead of the default `page` variable:

```js
// Reuse an empty about:blank tab if available, otherwise create a new one.
// IMPORTANT: always navigate immediately in the same call to avoid another
// agent grabbing the same about:blank tab between execute calls.
state.page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage());
await state.page.goto('https://example.com');
// Use state.page for ALL subsequent operations
```

### Handle Page Closures Gracefully

The user may close your page by accident. Always check before using it and recreate if needed:

```js
if (!state.page || state.page.isClosed()) {
	state.page = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage());
}
await state.page.goto('https://example.com');
```

### Use an Existing Page Only When the User Asks

Only use a page from `context.pages()` if the user explicitly asks you to control a specific tab
they already opened (e.g., they're logged into an app). Find it by URL pattern and store it in
state:

```js
const pages = context.pages().filter((x) => x.url().includes('myapp.com'));
if (pages.length === 0)
	throw new Error('No myapp.com page found. Ask user to enable playwriter on it.');
if (pages.length > 1) throw new Error(`Found ${pages.length} matching pages, expected 1`);
state.targetPage = pages[0];
```

### List All Available Pages

```js
context.pages().map((p) => p.url());
```

## Navigation

**Use `domcontentloaded`** for `page.goto()`:

```js
await state.page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page: state.page, timeout: 5000 });
```

## Popup Windows Become Tabs Automatically

The extension intercepts Chrome popup windows (`window.open(url, '', 'width=...')`, OAuth login
flows) and relocates them into the main window as regular tabs. You don't need cmd+click or
`{ modifiers: ['Meta'] }` to avoid popups. When a page opens another, you receive a
`[WARNING] New page opened from current page (index N, initial url: ...)` and can access it via
`context.pages()[N]`.

### Login Buttons That Open Popups

```js
await state.page.locator('button:has-text("Login with Google")').click();
await state.page.waitForTimeout(1000);

// New tab is the last page in the context
const pages = context.pages();
const loginPage = pages[pages.length - 1];

// Complete login flow in loginPage, cookies are shared with original page
await loginPage.locator('[data-email]').first().click();
await loginPage.waitForURL('**/callback**');
// Original page should now be authenticated
```

## iFrames

Two approaches depending on what you need:

```js
// frameLocator: for chaining locator operations (click, fill, etc.)
const frame = state.page.frameLocator('#my-iframe');
await frame.locator('button').click();

// contentFrame: returns a Frame object, needed for snapshot({ frame })
const frame2 = await state.page.locator('iframe').contentFrame();
await snapshot({ frame: frame2 });
```

## Dialogs

Handle alerts/confirms/prompts:

```js
state.page.on('dialog', async (dialog) => {
	console.log(dialog.message());
	await dialog.accept();
});
await state.page.click('button.trigger-alert');
```
