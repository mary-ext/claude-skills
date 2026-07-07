# Playwriter Setup & Sessions

## Session Management

Each session runs in an **isolated sandbox** with its own `state` object.

Get a new session ID:

```bash
npx playwriter@latest session new
# outputs: 1
```

**Always use your own session** — pass `-s <id>` to all commands. Using the same session preserves
your `state` between calls. Using a different session gives you a fresh `state`.

List active sessions:

```bash
npx playwriter@latest session list
# ID  State Keys
# --------------
# 1   myPage, userData
# 2   -
```

Reset a stale session:

```bash
npx playwriter@latest session reset <sessionId>
```

## Direct CDP Connection (--direct)

Only use `--direct` when the user explicitly asks for it. This mode requires the user to accept a
debugging approval dialog in Chrome, so it cannot be used autonomously.

`--direct` connects to Chrome's DevTools Protocol without the extension. Unlike extension mode, it
gives access to **all existing pages** in the browser — no need to enable per tab. Works with any
Chromium browser (Chrome, Brave, Arc, Edge, etc.).

The user must first enable debugging in Chrome:

- Open `chrome://inspect/#remote-debugging` in Chrome, or
- Launch Chrome with `chrome --remote-debugging-port=9222`

Then create a session:

```bash
npx playwriter@latest session new --direct
```

By default, `context` is bound to the first Chrome profile. If the user has multiple profiles open,
use `browser.contexts()` to access other profiles' pages and cookies:

```js
const contexts = browser.contexts();
// contexts[0] = first profile, contexts[1] = second profile, etc.
const otherProfilePage = contexts[1].pages()[0];
```

`browser.contexts()` only makes sense when using `--direct`. In extension mode there is just one
context for each session.

**Limitations:** screen recording (`recording.start/stop`) is unavailable in direct mode.

## Starting Chrome

If Chrome is not running, the extension can't connect. Start Chrome from the command line before
retrying:

```bash
# macOS
open -a "Google Chrome" --args --profile-directory=Default

# Linux
google-chrome --profile-directory=Default &

# Windows (cmd)
start chrome.exe --profile-directory=Default

# Windows (PowerShell)
Start-Process chrome.exe -ArgumentList '--profile-directory=Default'
```

To also enable automatic tab capture for screen recording (no manual extension click needed), add
the `--allowlisted-extension-id` and `--auto-accept-this-tab-capture` flags:

```bash
# macOS
open -a "Google Chrome" --args --profile-directory=Default --allowlisted-extension-id=jfeammnjpkecdekppnclgkkffahnhfhe --auto-accept-this-tab-capture

# Linux
google-chrome --profile-directory=Default --allowlisted-extension-id=jfeammnjpkecdekppnclgkkffahnhfhe --auto-accept-this-tab-capture &

# Windows
start chrome.exe --profile-directory=Default --allowlisted-extension-id=jfeammnjpkecdekppnclgkkffahnhfhe --auto-accept-this-tab-capture
```

## Debugging Issues

If some internal critical error happens you can read the relay server logs:

```bash
npx playwriter@latest logfile  # prints the log file path
# typically: ~/.playwriter/relay-server.log
```

The relay log contains logs from the extension, MCP and WS server. A separate CDP JSONL log is
created alongside it with all CDP commands/responses and events, with long strings truncated. Both
files are recreated every time the server starts.

Example: summarize CDP traffic counts by direction + method:

```bash
jq -r '.direction + "\t" + (.message.method // "response")' ~/.playwriter/cdp.jsonl | uniq -c
```

If you find a bug, you can create a gh issue using
`gh issue create -R remorses/playwriter --title title --body body`. Ask for user confirmation before
doing this.
