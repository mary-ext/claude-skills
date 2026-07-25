---
name: tidy
description: >
  Review changed code for reuse, quality, efficiency, and altitude, then fix any issues found.
argument-hint: '[<target>]'
---

Improve the quality of the changed code. Fix any issues found.

## Phase 1: Gather the diff

Run `git diff @{upstream}...HEAD` to get the diff under review, falling back to
`git diff main...HEAD` or `git diff HEAD~1` when there is no upstream. Also run `git diff HEAD` and
include the working-tree changes when that range diff is empty or uncommitted changes exist — this
review usually runs before the commit, so a range-only diff often reviews nothing.

When the user names a target — a PR number, branch name, or file path — review that instead. Treat
the resulting diff as the review scope.

## Phase 2: Launch four review agents in parallel

Use the Agent tool to launch all four agents concurrently in a single message. Pass each agent the
full diff so it has the complete context, plus one of the four angles below.

Each agent reports findings as `file`, `line`, a one-line `summary`, and the concrete cost — what is
duplicated, wasted, or made harder to maintain. Naming the cost keeps findings actionable and makes
false positives easy to spot in Phase 3.

### Agent 1: Code Reuse Review

For each change:

1. **Search for existing utilities and helpers** that could replace newly written code. Look for
   similar patterns elsewhere in the codebase — common locations are utility directories, shared
   modules, and files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function
   to use instead.
3. **Flag any inline logic that could use an existing utility** — hand-rolled string manipulation,
   manual path handling, custom environment checks, ad-hoc type guards, and similar patterns are
   common candidates.

### Agent 2: Code Quality Review

Review the same changes for hacky patterns:

1. **Redundant state**: state that duplicates existing state, cached values that could be derived,
   observers/effects that could be direct calls
2. **Parameter sprawl**: adding new parameters to a function instead of generalizing or
   restructuring existing ones
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a
   shared abstraction
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking
   existing abstraction boundaries
5. **Stringly-typed code**: using raw strings where constants, enums (string unions), or branded
   types already exist in the codebase
6. **Unnecessary JSX nesting**: wrapper Boxes/elements that add no layout value — check if inner
   component props (flexShrink, alignItems, etc.) already provide the needed behavior
7. **Nested conditionals**: ternary chains (`a ? x : b ? y : ...`), nested if/else, or nested switch
   3+ levels deep — flatten with early returns, guard clauses, a lookup table, or an if/else-if
   cascade
8. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already
   do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious
   WHY (hidden constraints, subtle invariants, workarounds)
9. **Dead code left behind**: a helper whose last caller the diff removed, a flag nothing reads, a
   branch made unreachable by the change

### Agent 3: Efficiency Review

Review the same changes for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls,
   N+1 patterns
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event
   handlers that fire unconditionally — add a change-detection guard so downstream consumers aren't
   notified when nothing changed. Also: if a wrapper function takes an updater/reducer callback,
   verify it honors same-reference returns (or whatever the "no change" signal is) — otherwise
   callers' early-return no-ops are silently defeated
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU
   anti-pattern) — operate directly and handle the error
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks
7. **Scope captured by long-lived objects**: an object built from a closure or captured environment
   keeps its entire enclosing scope alive for the object's lifetime, which leaks when that scope
   holds large values — prefer a class/struct that copies only the fields it needs
8. **Overly broad operations**: reading entire files when only a portion is needed, loading all
   items when filtering for one

### Agent 4: Altitude Review

Review the same changes for altitude — whether each change is implemented at the right depth, or as
a bandaid downstream of the real cause:

1. **Symptom-level fixes**: a guard, fallback, retry, or coercion added downstream of whatever
   produced the bad value. Trace the value to its origin — the fix usually belongs where the value
   is created, so the bad state becomes impossible rather than tolerated
2. **Wrong layer**: business rules in a view/component, presentation concerns in a data or storage
   layer, validation in a handler when the schema already validates it, I/O reached for from inside
   a pure helper
3. **Special-casing in shared code**: an `if (specificCase)` branch inside a general function that
   only one caller needs — hoist it to that caller, or generalize the underlying mechanism so the
   special case disappears. Also the reverse: a caller working around a shared function's limitation
   that the function should own
4. **Wrong scope of generality**: a helper parameterized for configurability with exactly one call
   site, or logic repeated across several call sites that belongs one level up
5. **Misplaced code**: a new function in an unrelated file when an obvious home exists nearby;
   exported when its only callers live in its own module; added to a barrel/index file, widening the
   public surface with no external consumer
6. **Parameter threading**: a value passed through layers that neither read nor transform it — check
   whether the edge that consumes it can resolve it directly

Report a finding when the correct location already exists, and name it. When the fix would require
new structure — a new module, layer, or abstraction — mark the finding **out of scope** and describe
in one line what it would take; a restructure that size is the user's call to make.

## Phase 3: Fix issues

Wait for all four agents to complete. Deduplicate findings that point at the same line or mechanism,
keeping whichever states the cost most concretely. Fix each remaining finding directly.

Skip a finding, noting the skip rather than arguing with it, when its fix would:

- change intended behavior
- require changes well outside the reviewed diff
- rest on a premise the diff contradicts (a false positive)

Altitude findings marked out of scope are the exception: leave the code as it is and list them in
the final summary as observations for the user to decide on.

When done, briefly summarize what was fixed and what was skipped (or confirm the code was already
clean).
