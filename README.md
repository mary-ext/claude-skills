# mary-skills

Personal Claude Code skills, packaged as installable plugins so they travel across devices (Linux ↔
Mac) instead of living loose in `~/.claude/skills/`.

This repo is a **plugin marketplace** (`.claude-plugin/marketplace.json`) containing four plugins:

| Plugin              | Skills                                                   | What it does                                                                     |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `oracle`            | `oracle`                                                 | Independent second-opinion advisor (`ask.sh` / `review.sh`).                     |
| `playwriter`        | `playwriter`                                             | Drive your running Chrome via the Playwriter CLI (cookies, logins, profile).     |
| `simplify`          | `simplify`                                               | Review changed code for reuse, quality, and efficiency, then fix issues.         |
| `claude-directives` | `writing-claude-directives`, `prompt-security-hardening` | Write instructions Claude reads, and avoid secrets/unsafe-shell leakage in them. |

## Install

Add the marketplace once, then install the plugins you want.

**From a local clone:**

```
/plugin marketplace add ~/projects/claude-skills
/plugin install oracle@mary-skills
/plugin install playwriter@mary-skills
/plugin install simplify@mary-skills
/plugin install claude-directives@mary-skills
```

**From GitHub** (after pushing this repo):

```
/plugin marketplace add <github-user>/claude-skills
/plugin install oracle@mary-skills
```

Use `/plugin marketplace add <full-git-url>.git` for non-GitHub remotes (the `.git` suffix is
required so Claude Code clones it rather than treating the URL as a hosted `marketplace.json`).

## Invocation

Plugin skills are namespaced by plugin name, so they're invoked as `/<plugin>:<skill>`:

- `/oracle:oracle`
- `/playwriter:playwriter`
- `/simplify:simplify`
- `/claude-directives:writing-claude-directives`
- `/claude-directives:prompt-security-hardening`

Model auto-invocation still works off each skill's `description`, regardless of namespace.

## Layout

```
.claude-plugin/marketplace.json     # catalog listing the 4 plugins
plugins/<name>/
  .claude-plugin/plugin.json        # per-plugin manifest
  skills/<skill>/SKILL.md           # one or more skills
```

## Notes

- On the source machine these skills also still exist in `~/.claude/skills/`. Once a plugin is
  installed, remove the matching loose copy from `~/.claude/skills/` to avoid a duplicate of the
  same skill.
- `oracle` and `playwriter` shell out to external CLIs (`ask.sh`/`review.sh`, Playwriter) — make
  sure those are installed and on `PATH` on each device.
