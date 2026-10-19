---
name: update-docs
description: The repo-kit standard for agent instructions and docs — which layer an instruction belongs in (CLAUDE.md, a path-scoped rule, a skill, references/, a hook, README, docs/), size budgets, how to write and name a skill, and keeping docs in sync with code. Use when adding, renaming or restructuring a skill, rule or CLAUDE.md, deciding where a new convention should live, when code changes add or rename exports, routes, commands or environment variables, or when the user says "update docs", "sync documentation", "deduplicate docs" or "audit docs".
paths:
    - 'CLAUDE.md'
    - 'README.md'
    - 'docs/**'
    - '.claude/**'
allowed-tools: Bash(bun run check:agents), Bash(git status *), Bash(git diff *)
---

# Update docs — the repo-kit standard

Every repo Kwan owns follows this one standard, so any session reads any repo the same way. This file and
`.claude/rules/delivery.md` are copied verbatim from the repo-kit repo and carry a stamp; edit them there,
never here. This repo's own half — what to touch when its code changes — is [`local.md`](local.md).

## 1. Which layer an instruction belongs in

Decide this before writing anything. **A fact lives in exactly one place; everywhere else links to it.**

| The instruction is…                                        | Location                                   | Load cost                                                       |
| :--------------------------------------------------------- | :----------------------------------------- | :-------------------------------------------------------------- |
| A fact or guardrail every session needs                    | `CLAUDE.md`                                | Every session                                                   |
| A guardrail for **certain files**                          | `.claude/rules/*.md` with `paths:`         | When a matching file is read                                    |
| Something that must happen **every time**, no exceptions   | a hook in `.claude/settings.json`          | None — it runs, it is not read                                  |
| A per-area convention or a repeatable procedure            | a skill in `.claude/skills/<name>/`        | Name + description: listed (or on a `paths:` match). Body: when invoked |
| Bulk detail behind a skill (tables, schemas, subsystems)   | `references/<topic>.md` beside `SKILL.md`  | When the skill links it and the model follows the link          |
| A long task whose output would flood the conversation      | a subagent in `.claude/agents/`            | Its own context                                                 |
| Human onboarding, setup, command index                     | `README.md`                                | Never loaded by an agent                                        |
| Cross-cutting reference or history                         | `docs/`                                    | Only when linked                                                |

Rules of thumb: Claude got it wrong twice → `CLAUDE.md`; the same playbook pasted a third time → a skill;
"never do X" that must hold → a hook, because an instruction is a request, not a guarantee.

## 2. Size budgets

| File                        | Budget                                        | Why                                   |
| :-------------------------- | :-------------------------------------------- | :------------------------------------ |
| `CLAUDE.md`                 | **≤ 200 lines**, target 120                    | Always on, every session              |
| `.claude/rules/*.md`        | No cap — scope it with `paths:`               | Only when a matching file is read     |
| `.claude/skills/*/SKILL.md` | **Target 100–150 lines, ceiling 500**         | Loaded whole on every invocation      |

Past the target, move detail into `references/<topic>.md` and link it — bundled files cost nothing until
opened. **Never trade ground-truth accuracy for line count.**

## 3. Writing a skill

```yaml
---
name: api-conventions          # = the folder name, kebab-case
description: Conventions for the Elysia API under apps/api — modules, validation, errors. Use when adding or editing anything under apps/api, a route, a schema, or when asked how API code should look here.
paths:                         # required for *-conventions skills
    - 'apps/api/**'
allowed-tools: Bash(bun run test *), Bash(git diff *)   # optional — COMMA-separated
argument-hint: '[area]'        # optional — shown for /name
disable-model-invocation: true # optional — destructive procedures: /name only, never on Claude's judgement
---
```

- **The description is the trigger** — the only text in context until the skill loads. Third person, one
  sentence of capability, then `Use when <triggers>`: the words a person types, the folders and file types.
  ≤ 1,024 chars, key use case first (the listing truncates). Quote it when it contains `#` or `: ` — an
  unquoted ` #` silently cuts the rest as a YAML comment.
- **Naming:** an area → `<area>-conventions` · a procedure → verb-object (`update-docs`, `add-feature`,
  `audit-seo`) · every repo's design skill is `design`. Never `helper`, `utils`, `tools`.
- **Body:** a one-paragraph scope, numbered sections, one default way (not a menu), a closing checklist.
  No dates or "currently" claims that rot — state the rule and cite the code.
- **Layout:** `references/` for detail, `scripts/` for code the skill runs (Bun TS for new scripts),
  `assets/` or `templates/` for files it copies. Link every bundled file from `SKILL.md`; the check fails on
  an unlinked one.
- **Ground truth:** verify every export, route, field and constraint against the code and cite it as
  `path/file.ts:line`. A wrong skill is worse than none.
- **Third-party text:** link it at its URL; vendor a copy only with its LICENSE beside it.
- **Secrets:** never in a skill, rule or CLAUDE.md — not even where they are kept.

## 4. Claude-only

These repos are Claude Code only. No `AGENTS.md`, `CODEX.md`, `GEMINI.md`, `.cursorrules`, `.agents/` or
`.codex/`; slash commands are skills, not `.claude/commands/`. A file a tool writes for itself (Next's
`apps/*/AGENTS.md`) is gitignored, not committed.

## 5. CLAUDE.md shape

Five headings, in order: `## Safety` (what is production, what needs Kwan's yes) · `## Delivery contract`
(base branch, the `gate` chain, repo-specific delivery rules — the generic ones are in
`.claude/rules/delivery.md`) · `## Read before you edit` (one table of rules, one of skills, each linked) ·
`## Repository map` · `## Further reading`. A qualifier is fine ("Production safety"); extra sections are
fine; every skill and rule is linked from it.

## 6. Sync after code changes

Docs move with the code, in the same commit. The generic cases:

- **A script added or renamed in `package.json`** → README command index.
- **An environment variable** → the app's `.env.example` and the deployment doc.
- **A route, module or export added, renamed or removed** → the owning `*-conventions` skill and any link to it.
- **A port, a service, a collection, a queue** → the `CLAUDE.md` repository map and the doc that owns it.
- **A skill or rule renamed** → every link to it, and the tables in `CLAUDE.md`.

This repo's specific map is in [`local.md`](local.md).

## 7. Dedup recipe

1. `wc -l CLAUDE.md .claude/skills/*/SKILL.md` against §2.
2. A section that is mostly tables or subsystem detail moves to `references/<topic>.md`.
3. A restatement becomes a link to its one home — the gate to `CLAUDE.md`, delivery to
   `.claude/rules/delivery.md`.
4. Re-verify what moved against the code (§3 ground truth).

## 8. Gate

```bash
bun run check:agents
```

[`scripts/check-agent-docs.ts`](scripts/check-agent-docs.ts) checks frontmatter (real YAML parse, known keys, `name` = folder, the `Use when` trigger, `paths:` on
`*-conventions`, comma-separated `allowed-tools`), the budgets, links, anchors and `@imports`, unlinked
bundled files, retired files, broken symlinks, the stamped core, and that `bun run gate` calls it.

## 9. Checklist

- [ ] Right layer (§1), stated once, linked everywhere else
- [ ] `name` = folder; description = capability + `Use when …`, quoted if it has `#` or `: `
- [ ] Within budget (§2); detail in `references/`, every bundled file linked
- [ ] Every claim verified against the code and cited `file:line`
- [ ] `CLAUDE.md` links the new or renamed skill or rule
- [ ] `bun run check:agents` clean

<!-- repo-kit: version=2026.10.19 hash=57cad3421c2d -->
