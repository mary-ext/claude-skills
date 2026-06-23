# Writing CLAUDE.md Files

CLAUDE.md-specific guidance. Apply alongside the universal principles in [SKILL.md](SKILL.md).

CLAUDE.md files bridge Claude's statelessness. They preserve context so humans don't re-explain architectural intent every session.

## Top-Level vs Subdirectory

| Level | Focus |
|-------|-------|
| Top-level (`./CLAUDE.md`) | HOW to work in this codebase: tech stack, commands, conventions |
| Subdirectory (`src/auth/CLAUDE.md`) | WHY this piece exists and what it PROMISES: contracts, intent, invariants |

Claude auto-reads CLAUDE.md from current directory up to root. Depth: typically one level (domain). Occasionally two (subdomain). Rarely more.

| Question | Top-level | Subdirectory |
|----------|-----------|--------------|
| Applies project-wide? | ✓ | |
| New engineer needs on day 1? | ✓ | |
| About commands/conventions? | ✓ | |
| About WHY a component exists? | | ✓ |
| About contracts between parts? | | ✓ |
| Changes when the domain changes? | | ✓ |

## Top-Level Template

```markdown
# [Project Name]

Last verified: [DATE — use `date +%Y-%m-%d`]

## Tech Stack
- Language: TypeScript 5.x
- Framework: Next.js 14
- Database: PostgreSQL
- Testing: Vitest

## Commands
- `npm run dev` — start dev server
- `npm run test` — run tests
- `npm run build` — production build

## Project Structure
- `src/domains/` — domain modules
- `src/shared/` — cross-cutting utilities
- `src/infrastructure/` — external adapters

## Conventions
- Functional Core / Imperative Shell
- Domain modules are self-contained
- See domain CLAUDE.md files for domain-specific guidance

## Boundaries
- Safe to edit: `src/`
- Never touch: `migrations/` (immutable), `*.lock` files
```

## Subdirectory Template (Domain-Level)

```markdown
# [Domain Name]

Last verified: [DATE — use `date +%Y-%m-%d`]

## Purpose
1-2 sentences: WHY this domain exists, what problem it solves.

## Contracts
- **Exposes:** public interfaces callers can use
- **Guarantees:** promises this domain keeps
- **Expects:** what callers must provide

## Dependencies
- **Uses:** domains/services this depends on
- **Used by:** what depends on this
- **Boundary:** what should NOT be imported here

## Key Decisions
- [Decision]: [Rationale]

## Invariants
- [Thing that must always be true]

## Key Files
- `index.ts` — public exports
- `service.ts` — main implementation

## Gotchas
- [Non-obvious thing that will bite you]
```

## Example: Auth Domain

```markdown
# Auth Domain

Last verified: 2026-05-08

## Purpose
Ensures user identity is verified exactly once at the system edge.
All downstream services trust the auth token without re-validating.

## Contracts
- **Exposes:** `validateToken(token) → User | null`, `createSession(credentials) → Token`
- **Guarantees:** Tokens expire after 24h. User objects always include roles.
- **Expects:** Valid JWT format. Database connection available.

## Dependencies
- **Uses:** Database (users table), Redis (session cache)
- **Used by:** All API routes, billing domain (user identity only)
- **Boundary:** Do NOT import from billing, notifications, or other domains

## Key Decisions
- JWT over session cookies: stateless auth for horizontal scaling
- bcrypt cost 12: legacy decision, migration to argon2 tracked in ADR-007

## Invariants
- Every user has exactly one primary email
- Deleted users are soft-deleted, never hard deleted
- User IDs are UUIDs, never sequential

## Gotchas
- Token validation returns null on invalid (doesn't throw)
- Never return raw password hashes in User objects
```

## Freshness Dates Are Mandatory

Every CLAUDE.md must include a "Last verified" date. Use Bash to get the actual date — don't hallucinate:

```bash
date +%Y-%m-%d
```

```markdown
Last verified: 2026-05-08
```

Stale CLAUDE.md is worse than none — the date signals when contracts were last confirmed accurate.

## Don't

- **Use `@./service.ts` syntax** to reference files. It force-loads them, burning tokens. Just name them — Claude reads on demand.
- **Duplicate parent content** into subdirectories. They inherit.
- **Document code style rules.** Linters do that.
- **List every command.** Point to `package.json` or similar.
- **Include sensitive information** (keys, credentials, internal URLs that shouldn't leak).

## When to Create a Subdirectory CLAUDE.md

Create when:

- Domain has non-obvious contracts with other parts.
- Architectural decisions affect how code should evolve.
- Invariants exist that aren't obvious from code.
- New sessions consistently need the same context re-explained.

Don't create for:

- Trivial utility folders.
- Implementation details that change frequently.
- Content better captured in code comments.

## Updating

When updating any CLAUDE.md:

1. Refresh the date with `date +%Y-%m-%d`.
2. Verify contracts still hold — read the code, check invariants.
3. Remove stale content. Better short and accurate than long and wrong.
4. Keep token-efficient: <300 lines top-level, <100 lines subdirectory.

## Checklist

**Top-level:**

- [ ] Tech stack listed
- [ ] Key commands documented
- [ ] Project structure overview
- [ ] Freshness date from `date +%Y-%m-%d`
- [ ] Under 300 lines

**Subdirectory:**

- [ ] Purpose explains WHY (not what)
- [ ] Contracts: exposes, guarantees, expects
- [ ] Dependencies and boundaries clear
- [ ] Key decisions with rationale
- [ ] Invariants documented
- [ ] Freshness date from `date +%Y-%m-%d`
- [ ] Under 100 lines
