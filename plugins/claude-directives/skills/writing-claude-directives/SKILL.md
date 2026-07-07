---
name: writing-claude-directives
description:
  Use when writing or revising any instruction Claude will read - skills, CLAUDE.md files, agent
  prompts, system prompts, hook output. Covers token efficiency, compliance techniques, discovery,
  and per-format templates.
---

# Writing Claude Directives

Universal principles for any instruction Claude will read. For format-specific guidance, see:

- **Skills:** [skills.md](skills.md) — naming, types, SKILL.md template, discovery
- **CLAUDE.md:** [claude-md-files.md](claude-md-files.md) — top-level vs subdirectory, templates,
  freshness dates

When the directive will involve shell commands, env vars, credentials, or git, also apply
`prompt-security-hardening`.

## Core Principles

**1. Claude is smart. Only write what it doesn't already know.** Challenge each line — does this
justify its token cost?

**2. Positive > negative framing.** "Don't do X" triggers thinking about X (pink-elephant problem).
Say what TO do.

```markdown
# Bad — triggers the behavior

Don't create duplicate files.

# Good — directs to correct behavior

Update existing files in place.
```

**3. Context motivates compliance.** Explain WHY, not just WHAT. Claude generalizes from motivation.

```markdown
# Less effective

NEVER use ellipses.

# More effective

Your response will be read aloud by a TTS engine, which can't pronounce ellipses. Don't use them.
```

**4. Placement matters.** Instructions at prompt start and end receive higher attention. Critical
rules go at the boundaries.

**5. ~150 instruction limit.** More instructions = uniform degradation across ALL rules. Prune
ruthlessly.

**6. Repetition enforces critical rules.** For high-stakes requirements, repeat with different
framings.

## Token Efficiency

- Frequently-loaded directives: <200 words.
- Skills / CLAUDE.md: <500 lines total; subdirectory CLAUDE.md <100 lines.
- Reference `--help` output instead of re-documenting flags.
- Cross-reference other skills instead of duplicating content.
- **Progressive disclosure:** main file is overview + links; reference files load on-demand.

## Compliance Techniques

Claude 4.x is highly responsive to instructions. Lead with context and motivation; reserve
imperatives for true boundaries.

### Primary: Context + Motivation

```markdown
# Raw authority — easy to rationalize past

You MUST run tests before committing.

# Motivation — Claude generalizes

Run tests before committing. Untested commits break CI for the whole team and block other developers
from merging.
```

### Secondary: Structural Enforcement

Make compliance the path of least resistance.

| Pattern                                | Example                                 |
| -------------------------------------- | --------------------------------------- |
| Workflow steps                         | Numbered steps with verification gates  |
| Task tracking (TaskCreate / TodoWrite) | Checklists without tracking get skipped |
| Forced commitment                      | "Announce: I'm using [skill]"           |
| Explicit blocking                      | "If X happens, stop and do Y instead"   |

### Escalation: Imperatives — Sparingly

For Claude 4.x, aggressive language ("YOU MUST", "CRITICAL") can cause overtriggering. Reserve for
true boundaries:

```markdown
# Often sufficient

Use this tool when searching for files.

# Reserve imperatives for hard boundaries

Never commit secrets to version control.
```

### By Directive Type

| Type                           | Approach                                            |
| ------------------------------ | --------------------------------------------------- |
| Discipline (TDD, verification) | Context + structural enforcement + loophole closure |
| Technique (patterns, how-to)   | Clear steps, "we want quality" framing              |
| Reference (documentation)      | Clarity only; no persuasion needed                  |

## Structure Patterns

### XML for Multi-Part Directives

Claude parses XML effectively — use it for multi-part directives:

```xml
<task>What to accomplish</task>
<constraints>Hard requirements</constraints>
<output_format>Expected structure</output_format>
<examples>Input/output pairs</examples>
```

XML also works as a format indicator:

```xml
<smoothly_flowing_prose>Write report sections here</smoothly_flowing_prose>
<structured_data>JSON or tables here</structured_data>
```

XML outperforms markdown, JSON, and YAML for rule preservation in long prompts.

### Match Prompt Style to Desired Output

The formatting style in your prompt influences Claude's response. Include markdown if you want
markdown output; remove it for plain text.

### Workflows and Feedback Loops

Break complex tasks into checkable steps:

```markdown
- [ ] Step 1: Analyze inputs
- [ ] Step 2: Generate plan
- [ ] Step 3: Validate plan
- [ ] Step 4: Execute
- [ ] Step 5: Verify output
```

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

### Action Bias Templates

```xml
<default_to_action>
By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing.
</default_to_action>
```

```xml
<do_not_act_before_instructions>
Do not jump into implementation or change files unless clearly instructed. When the user's intent is ambiguous, default to providing information, doing research, and providing recommendations rather than taking action. Only proceed with edits when the user explicitly requests them.
</do_not_act_before_instructions>
```

### Overengineering Prevention

Claude 4.x tends to overengineer. Drop this in when needed:

```markdown
Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep
solutions simple and focused.

Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't
need surrounding code cleaned up. A simple feature doesn't need extra configurability.

Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal
code and framework guarantees. Only validate at system boundaries (user input, external APIs).

Don't create helpers, utilities, or abstractions for one-time operations. Don't design for
hypothetical future requirements. Reuse existing abstractions where possible.
```

## Testing Directives (RED-GREEN-REFACTOR)

Writing directives is TDD applied to process documentation: write the failing test first, then the
directive, then close loopholes.

**RED — baseline:** run a pressure scenario WITHOUT the directive (combine pressures: time + sunk
cost + exhaustion). Document violations and rationalizations verbatim.

**GREEN — minimal directive:** address the specific baseline failures. Re-run scenarios WITH the
directive. Verify compliance.

**REFACTOR — close loopholes:** find new rationalizations that emerge under the directive. Add
explicit counters. Re-test until bulletproof.

| Type       | Test approach                          | Success criterion                    |
| ---------- | -------------------------------------- | ------------------------------------ |
| Discipline | Pressure scenarios, combined stressors | Follows rule under maximum pressure  |
| Technique  | Application scenarios, edge cases      | Successfully applies to new scenario |
| Pattern    | Recognition + counter-examples         | Knows when/how AND when NOT to apply |
| Reference  | Retrieval + application tests          | Finds and correctly uses information |

## Anti-Rationalization

For discipline-enforcing directives, anticipate excuses:

```markdown
## Red Flags — STOP

If you find yourself reasoning any of these, you're rationalizing:

- "This is simple enough to skip"
- "I already tested manually"
- "The spirit not the letter"
- "This case is different"

All mean: follow the process.
```

## Common Mistakes

| Mistake                                                    | Fix                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Verbose explanations                                       | Claude knows the basics — omit                        |
| Multiple valid approaches                                  | Pick one default, escape hatch for edge cases         |
| Vague triggers                                             | Specific symptoms: "tests flaky", "race condition"    |
| Deeply nested references                                   | Keep one level deep from main file                    |
| Windows paths                                              | Always forward slashes                                |
| Aggressive language for 4.x                                | Lead with context, reserve imperatives for boundaries |
| Narrative examples ("In session 2025-10-03 we found...")   | Too specific, not reusable                            |
| Multi-language dilution (`example-js.js`, `example-py.py`) | Pick one language, do it well                         |
| Code in flowcharts                                         | Can't copy-paste; use code blocks                     |
| Generic labels (`helper1`, `step3`)                        | Use semantic names                                    |

## Model-Specific Notes

**Opus 4.5 — "think" sensitivity:** when extended thinking is disabled, Opus 4.5 is sensitive to the
word "think" and variants. Replace with:

- "consider" instead of "think about"
- "evaluate" instead of "think through"
- "determine" instead of "think whether"

## Checklist

Before publishing any directive:

- [ ] No content Claude already knows (no token waste)
- [ ] Positive framing throughout
- [ ] WHY explained for non-obvious rules
- [ ] Imperatives reserved for true boundaries
- [ ] Under the size budget for its format
- [ ] If credentials/shell/git involved: also applied `prompt-security-hardening`
- [ ] Tested: ran a baseline scenario without it, then with it, and closed the loopholes

For skills, also see [skills.md](skills.md). For CLAUDE.md, also see
[claude-md-files.md](claude-md-files.md).
