# Writing Skills

Skill-specific guidance. Apply alongside the universal principles in [SKILL.md](SKILL.md).

A skill is a markdown file the harness loads when its `description` matches the user's task. Skills live under `.claude/skills/<name>/SKILL.md` (user) or `<plugin>/skills/<name>/SKILL.md` (plugin).

## Discovery

The `description` field in YAML frontmatter decides whether Claude finds the skill at all.

**Format:** `Use when <triggers> — <what it does>`. Third person. Specific symptoms, error messages, and tool names that Claude might search for.

```yaml
# Bad — vague, first person
description: I help with async testing

# Good — triggers + action, third person
description: Use when tests have race conditions or timing dependencies — replaces arbitrary timeouts with condition polling
```

If a skill covers multiple triggers (e.g., merged across formats), list them explicitly so any of them surfaces it.

## Naming

- **Gerund form** (`writing-skills`, `debugging-errors`) or named by action/insight (`condition-based-waiting`, not `async-helpers`).
- Letters, numbers, and hyphens only.
- Name by what the skill DOES, not what it's about.

## Skill Types

| Type | Description | Example |
|------|-------------|---------|
| Technique | Concrete method with steps | `condition-based-waiting` |
| Pattern | Mental model for problems | `flatten-with-flags` |
| Reference | API docs, syntax guides | `bash-quoting-reference` |
| Discipline | Enforces process under pressure | `tdd-cycle` |

## Directory Layout

```
skills/
  skill-name/
    SKILL.md              # required
    supporting-file.md    # only if needed (heavy reference, scripts)
```

**Separate files for:** heavy reference (100+ lines), reusable tools/scripts, optional deep dives.

**Keep inline:** principles, short patterns, anything <50 lines.

## SKILL.md Template

```markdown
---
name: skill-name-with-hyphens
description: Use when <triggers/symptoms> — <what it does, third person>
---

# Skill Name

## Overview
Core principle in 1-2 sentences.

## When to Use
Symptoms and use cases. When NOT to use.

## Core Pattern
Before/after comparison or key technique.

## Quick Reference
Table or bullets for scanning.

## Common Mistakes
What goes wrong + fixes.
```

## When to Create a Skill

Create when:

- The technique wasn't intuitively obvious to you.
- You'd reference it across projects.
- The pattern applies broadly; others would benefit.

Don't create for:

- One-off solutions.
- Standard practices documented elsewhere.
- Project-specific conventions (use CLAUDE.md instead).

## Testing

Skills are best tested with the RED-GREEN-REFACTOR cycle in [SKILL.md](SKILL.md). For discipline skills specifically, use **combined pressures** (time + sunk cost + exhaustion) — a skill that holds under one stressor often fails under two.

Common rationalizations to anticipate and block:

| Excuse | Reality |
|--------|---------|
| "Obviously clear" | Clear to you ≠ clear to agents. Test. |
| "Just a reference" | References have gaps. Test retrieval. |
| "Testing is overkill" | Untested skills have issues. Always. |
| "Too simple" | Simple things break. Test anyway. |

## Checklist

- [ ] Name uses gerund or action/insight; letters, numbers, hyphens only
- [ ] Description starts with "Use when…", third person, specific triggers
- [ ] One excellent example, not a catalog (no `example-js.js` + `example-py.py`)
- [ ] Directory contains only what's needed (no premature reference files)
- [ ] Tested with a pressure scenario (RED-GREEN-REFACTOR)
