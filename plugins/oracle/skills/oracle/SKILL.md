---
name: oracle
description: >
  An independent advisor. Call this before performing or planning any substantive work, when you
  believe the task is complete, when you believe you are stuck, when you are considering a change of
  approach, or when you need a second opinion.
user-invocable: false
---

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

---

If the task requires orientation first (finding files, seeing what's there), do that first.

Run oracle in the background and do not pipe it to `head`, `tail` or `grep`. The oracle takes
minutes to reason and the answer is not streamed, do not continuously poll for its output.

The oracle explores freely, avoid modifying any files that oracle might touch while it is running.
If you have nothing unrelated to work on, end your turn and wait.

## Formulating good questions

Be specific and self-contained. Each invocation starts with fresh context, the oracle has no memory
of previous questions or answers, so every question must stand on its own.

Include:

- What you're trying to achieve
- What you've tried or considered so far
- Relevant constraints or requirements

File attachments are optional. Attach them if you believe it may be immediately useful to the
oracle, avoid attaching them by reflex.

## Interpreting results

Treat the oracle's response as an advisory opinion, not a directive. After receiving it, do your own
investigation using the oracle's analysis as a starting point, then decide on a final approach.
