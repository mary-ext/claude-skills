---
name: writing-claude-directives
description:
  Use when writing any instruction Claude will read - skills, CLAUDE.md files, agent prompts, system
  prompts, tool descriptions, hook output. Covers token efficiency, compliance techniques,
  discovery, and per-format templates.
---

# Writing Claude Directives

Universal principles for any instruction Claude will read. For format-specific guidance, see:

- **Skills:** [skills.md](skills.md) — naming, types, SKILL.md template, discovery
- **CLAUDE.md:** [claude-md-files.md](claude-md-files.md) — top-level vs subdirectory, templates,
  freshness dates

When the directive will involve shell commands, env vars, credentials, or git, also apply
`prompt-security-hardening`.

## Core Principles

**1. Supply missing context.** Include the audience, environment, quality requirements, and reasons
for constraints. Omit defaults ("be accurate and thorough") and instructions for behavior Claude
already performs reliably.

**2. Use positive instructions.** Say what to do; naming an unwanted behavior can encourage it.

```markdown
# Bad — triggers the behavior

Don't create duplicate files.

# Good — directs to correct behavior

Update existing files in place.
```

Keep prohibitions for policy, safety, data constraints, or reproducible failures, and explain why.
Replace style prohibitions ("don't start with 'Certainly'") with the desired behavior ("start with
the answer").

**3. Context motivates compliance.** Explain WHY, not just WHAT. Claude generalizes from motivation.

```markdown
# Less effective

NEVER use ellipses.

# More effective

Your response will be read aloud by a TTS engine, which can't pronounce ellipses. Don't use them.
```

**4. State rules once, where they apply.** Excessive emphasis can cause over-triggering; hedges
("try to", "if possible") make requirements optional. A short closing recap is fine, but repeated
variants can conflict.

**5. Remove obsolete rules.** Cut redundant instructions and stale workarounds before shortening
context the task needs.

## Token Efficiency

- Frequently-loaded directives: <200 words.
- Skills / CLAUDE.md: <500 lines total; subdirectory CLAUDE.md <100 lines.
- Reference `--help` output instead of re-documenting flags.
- Cross-reference other skills instead of duplicating content.
- **Progressive disclosure:** main file is overview + links; reference files load on-demand.

## Compliance Techniques

Lead with context and motivation; reserve imperatives for true boundaries.

### Primary: Context + Motivation

```markdown
# Raw authority — easy to rationalize past

You MUST run tests before committing.

# Motivation — Claude generalizes

Run tests before committing. Untested commits break CI for the whole team and block other developers
from merging.
```

### Enforce in Code Where Possible

Enforce checkable rules with hooks, permissions, schemas, validators, or tests. Use prose to explain
the reason.

### Structural Enforcement

Make compliance the path of least resistance.

| Pattern                                | Example                                  |
| -------------------------------------- | ---------------------------------------- |
| Verification gates                     | "Proceed only when the validator passes" |
| Task tracking (TaskCreate / TodoWrite) | Checklists without tracking get skipped  |
| Forced commitment                      | "Announce: I'm using [skill]"            |
| Explicit blocking                      | "If X happens, stop and do Y instead"    |

### Emphasis

Use emphasis ("YOU MUST", "CRITICAL") only when testing shows an instruction is being missed. Apply
it to that instruction; broad emphasis can cause over-triggering.

```markdown
# Default

Use this tool when searching for files.

# Hard boundary, with its reason

Never commit secrets to version control; deleting the file leaves them in the history.
```

### By Directive Type

| Type                           | Approach                                            |
| ------------------------------ | --------------------------------------------------- |
| Discipline (TDD, verification) | Context + structural enforcement + loophole closure |
| Technique (patterns, how-to)   | Clear steps, "we want quality" framing              |
| Reference (documentation)      | Clarity only; no persuasion needed                  |

## Structure Patterns

### Prose for Behavior, Structure for Data

Use prose to explain rules, reasons, and priorities. Use tables and lists for reference data, and
XML tags to separate documents, examples, and user content:

```xml
<document>...</document>
<example>...</example>
```

### Match Prompt Style to Desired Output

The formatting style in your prompt influences Claude's response. Include markdown if you want
markdown output; remove it for plain text.

### Goals and Verification

For judgment tasks, state the outcome, constraints, and verification criteria. Let Claude plan the
work. Number steps where order matters.

Validate → fix → repeat:

```markdown
1. Generate output
2. Run validator
3. If errors: fix and go to step 2
4. Only proceed when validation passes
```

### Degrees of Freedom

Match specificity to fragility.

| Task type          | Freedom | Style                           |
| ------------------ | ------- | ------------------------------- |
| Fragile operations | Low     | Exact scripts, no modifications |
| Preferred patterns | Medium  | Templates with parameters       |
| Context-dependent  | High    | Principles and heuristics       |

### Examples

Claude may copy an example's length, tone, and structure. Use varied examples labeled illustrative
unless the output requires a fixed format. Omit examples for behavior Claude already handles.

### Scope and Autonomy

Choose a default and explain why. Illustrative examples:

```markdown
Implement requested changes; the user reviews the diff.
```

```markdown
Research and recommend, but change files only when asked; this repo is shared and edits need review.
```

```markdown
Keep changes scoped to the task to simplify review.
```

### Tool Descriptions

Describe the tool's behavior, use cases, exclusions, parameters, limits, and return values. Put
worked examples and follow-up instructions in a skill. Avoid blanket directives ("ALWAYS use this").
Keep tool names out of system prompts that must work with different tool sets.

## Testing Directives

Test behavior with and without the directive. Asking Claude whether it needs a rule is not a test.

**Baseline:** run a realistic scenario without the directive. For discipline directives, combine
pressures (time + sunk cost + exhaustion). Record violations and rationalizations verbatim.

**Add:** write the minimal directive that addresses the baseline failures. Re-run with it and verify
compliance.

**Remove:** remove one rule at a time and check whether the failure it prevented recurs. If it does,
restore the simplest effective wording.

Address new rationalizations by clarifying the principle before adding exceptions.

| Type       | Test approach                          | Success criterion                    |
| ---------- | -------------------------------------- | ------------------------------------ |
| Discipline | Pressure scenarios, combined stressors | Follows rule under maximum pressure  |
| Technique  | Application scenarios, edge cases      | Successfully applies to new scenario |
| Pattern    | Recognition + counter-examples         | Knows when/how AND when NOT to apply |
| Reference  | Retrieval + application tests          | Finds and correctly uses information |

## Anticipating Rationalizations

For discipline directives, address rationalizations observed in baseline testing. Illustrative
examples:

```markdown
## Rationalizations

- "This is simple enough to skip" — small changes can still break CI.
- "I already tested manually" — manual runs don't cover the suites CI runs.
- "This case is different" — if it is, say why to the user instead of skipping silently.
```

## Common Mistakes

| Mistake                                                    | Fix                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Verbose explanations                                       | Claude knows the basics — omit                                    |
| Multiple valid approaches                                  | Pick one default, escape hatch for edge cases                     |
| Vague triggers                                             | Specific symptoms: "tests flaky", "race condition"                |
| Deeply nested references                                   | Keep one level deep from main file                                |
| Windows paths                                              | Always forward slashes                                            |
| Aggressive language                                        | Lead with context, reserve imperatives for boundaries             |
| Hedged requirements ("try to include a summary")           | State it plainly: "Include a summary."                            |
| Trait claims ("you tend to over-explain")                  | State the desired behavior                                        |
| Narrative examples ("In session 2025-10-03 we found...")   | State the current rule; drop the history                          |
| Relative phrasing ("X now works differently", "no longer") | Describe current behavior                                         |
| Model-specific workarounds                                 | Record the affected model and failure; retest after model changes |
| Numeric output caps ("at most 50 words")                   | Qualitative guidance: "the length the question needs"             |
| "Don't narrate" / "no interim updates"                     | Say when user-facing updates are wanted                           |
| Blanket "never use bullets/headers"                        | Say when formatting is appropriate                                |
| Describing the grader ("you will be graded on...")         | State every requirement directly                                  |
| Strategy tips ("it's usually best to...")                  | Delete unless it changes what is allowed or how success is judged |
| Multi-language dilution (`example-js.js`, `example-py.py`) | Pick one language, do it well                                     |
| Code in flowcharts                                         | Can't copy-paste; use code blocks                                 |
| Generic labels (`helper1`, `step3`)                        | Use semantic names                                                |

## Keeping Directives Current

Record which model and failure each workaround addresses. After a model change, review directives
with `/claude-api prompt-audit` and retest the workarounds.

## Checklist

Before publishing any directive:

- [ ] Necessary context included; redundant instructions removed
- [ ] Positive framing; remaining prohibitions carry a reason
- [ ] WHY explained for non-obvious rules
- [ ] Each rule stated once, without hedges; emphasis only where testing showed it's needed
- [ ] Rules enforceable in code are enforced there
- [ ] Under the size budget for its format
- [ ] If credentials/shell/git involved: also applied `prompt-security-hardening`
- [ ] Tested with and without the directive, including rule removals

For skills, also see [skills.md](skills.md). For CLAUDE.md, also see
[claude-md-files.md](claude-md-files.md).
