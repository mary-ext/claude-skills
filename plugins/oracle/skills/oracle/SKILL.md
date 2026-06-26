---
name: oracle
description: >
  Instructions for invoking the oracle — an independent advisor you shell out to for a second
  opinion. This skill itself does nothing; it documents the bash commands (`ask.sh`, `review.sh`)
  you must run to actually consult the oracle. Read it when planning complex changes, debugging
  across multiple files, making architecture decisions, reviewing your own work, or when a
  different perspective would help.
user-invocable: false
---

# Oracle

This skill is **documentation only** — reading it does not summon the oracle. To actually consult
the oracle, you must run one of the bash scripts described below (`ask.sh` or `review.sh`) via the
Bash tool. The skill exists to tell you how.

The oracle itself is an independent advisor you shell out to for a second opinion. Use it to plan,
review your own work, understand existing code behavior, and debug problems.

## When to consult the oracle

- Planning complex implementations or refactors
- Debugging issues that span multiple files or components
- Architecture and design decisions with meaningful trade-offs
- Reviewing code for correctness, security, or missed edge cases
- When you're stuck or going in circles on a problem

## When NOT to consult the oracle

- Simple file reads, searches, or straightforward code changes — just do them yourself
- Questions you can answer confidently from context you already have
- Tasks that just need execution, not analysis

## How to invoke

**Always run in the background.** The oracle takes time to reason — use `run_in_background: true` on
the Bash call so you can continue working while it thinks. You'll be notified automatically when it
completes.

### General advice (`ask.sh`)

Use `ask.sh` for planning, debugging, architecture questions, and general second opinions.

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/ask.sh "Your detailed question with full context here"
```

**With file attachments** (use `--` separator, then list files or directories):

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/ask.sh "Review this auth flow for security issues" -- src/auth/login.ts src/auth/session.ts
```

You can also attach entire directories when the oracle needs broader context:

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/ask.sh "How does the plugin system work?" -- src/plugins/
```

### Adversarial review (`review.sh`)

Use `review.sh` when you want your work pressure-tested before shipping. Unlike `ask.sh`, the
reviewer defaults to skepticism — it actively tries to break confidence in the change rather than
validate it. It focuses on expensive, dangerous, or hard-to-detect failures: auth gaps, data loss,
race conditions, rollback safety, idempotency, and observability blind spots.

The output includes a verdict (`SHIP`, `NEEDS ATTENTION`, or `DO NOT SHIP`) and structured findings
with severity, location, failure scenario, evidence, and a concrete fix recommendation.

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/review.sh "Review these changes for safety issues" -- src/db/migration.ts src/api/handler.ts
```

Directories work here too — the oracle will explore them as needed:

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/review.sh "Check the new middleware stack for auth gaps" -- src/middleware/
```

You can also provide a focus area to steer the review:

```bash
# run_in_background: true
${CLAUDE_SKILL_DIR}/review.sh "Focus on race conditions and retry behavior in the queue processor" -- src/queue/processor.ts
```

If you have independent work to do, continue with it while waiting. Otherwise, **end your turn with
no further tool calls**. Do not use Monitor, TaskOutput, Read, sleep, or any other tool to check on
the oracle — the system delivers the result to you automatically as a notification when it finishes.
Polling just returns empty output and wastes tokens.

Don't pipe the output to `head` or `tail` — capture the whole response.

**Do not modify any files while the oracle is running** — not the attached files, not files adjacent
to them, and not files related to the question. The oracle explores freely: it reads attached files,
follows imports, inspects siblings in the same directory, and traces call chains. Any file it might
touch is off-limits until it finishes. Editing mid-run corrupts its view of the codebase and makes
its advice unreliable. If you have nothing unrelated to work on, stop and wait.

## Formulating good questions

Be specific and self-contained. Each invocation starts with fresh context — the oracle has no memory
of previous questions or answers, so every question must stand on its own.

Include:

- What you're trying to achieve
- What you've tried or considered so far
- Relevant constraints or requirements

File attachments are optional — use them when the oracle needs to examine code directly, but don't
attach files by reflex. Many questions are better served by describing the situation and including
short excerpts inline.

## Interpreting results

Treat the oracle's response as an advisory opinion, not a directive. After receiving it, do your own
investigation using the oracle's analysis as a starting point, then decide on a final approach.
