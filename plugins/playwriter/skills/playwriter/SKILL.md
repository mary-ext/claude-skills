---
name: playwriter
description:
  Drives the user's running Chrome via the Playwriter CLI. Use when the task needs their browser
  identity — cookies, logins, open tabs, profile.
---

<!-- Synced from `npx playwriter@latest skill` — playwriter v0.2.0, 2026-06-10. To re-check: `npx playwriter@latest skill > /tmp/playwriter-skill-latest.md` and diff against these files. -->

# Playwriter Skill

Control Chrome via the Playwriter CLI using Playwright code snippets executed in a sandboxed Node.js
environment.

**Always invoke Playwriter via `npx`:**

```bash
npx playwriter@latest <command>
```

Use `@latest` for the first session command of a task to pick up the newest version.

## Reference Docs

Read the files relevant to your current task. **Read `setup.md` and `workflow.md` first** before any
automation task.

| File             | Read when...                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `setup.md`       | Starting a new session, Chrome isn't running, or using `--direct` CDP mode.                                        |
| `workflow.md`    | **Required before any task.** Core rules, context variables, the observe→act→observe loop, and bash quoting.       |
| `observation.md` | You need to inspect page state: find elements, read text, check for errors, or decide between snapshot/screenshot. |
| `interaction.md` | You need to click, type, scroll, drag, upload files, or take screenshots.                                          |
| `navigation.md`  | Working with tabs, popups, iframes, dialogs, or managing the page lifecycle.                                       |
| `obstacles.md`   | Clicks aren't working, a modal is blocking the page, or content isn't loading.                                     |
| `scraping.md`    | Extracting data, intercepting network requests, downloading media, or using `page.evaluate`.                       |
| `recording.md`   | Recording videos or creating demo videos.                                                                          |
| `advanced.md`    | Using CDP, debugger, live editor, React source inspection, or pinned elements.                                     |

## When to Use Playwriter

- **JS-heavy sites** (SPAs like Instagram, Twitter, Facebook) — webfetch returns empty shells.
- **Cookie consent modals, login walls, age gates** — dismiss them before scraping.
- **Lazy-loaded content, carousels, infinite scroll** — interact to reveal content.
- **Authenticated pages** — reuse the user's existing Chrome session cookies.
- **Visual tasks** — screenshots, recordings, demos.

## Core Principles

- **Use `state.page`** stored in session state for all operations.
- **Observe → Act → Observe**: never chain multiple actions blindly.
- **Read and verify state with `snapshot()`** — you can't judge fine visual detail from a screenshot
  yourself (`observation.md`).
- **Single-quote `-e`** to prevent bash from corrupting JS code.

## Quick Start

1. **Get a session** (required for all commands):
   ```bash
   npx playwriter@latest session new
   ```
2. **Initialize your page** (first execute call only):
   ```bash
   npx playwriter@latest -s 1 -e 'state.page = context.pages().find((p) => p.url() === "about:blank") ?? (await context.newPage()); await state.page.goto("https://example.com", { waitUntil: "domcontentloaded" })'
   ```
3. **Observe → Act → Observe** (see `workflow.md`):
   ```bash
   npx playwriter@latest -s 1 -e 'console.log("URL:", state.page.url()); await snapshot({ page: state.page }).then(console.log)'
   ```
