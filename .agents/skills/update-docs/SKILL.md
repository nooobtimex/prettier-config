---
name: update-docs
description: The repo-kit standard for agent instructions and docs — which layer an instruction belongs in (AGENTS.md, a nested AGENTS.md, a skill, references/, a hook, README, docs/), size budgets, how to write and name a skill, and keeping docs in sync with code, for every AI coding tool (Claude Code, Codex, Antigravity, Copilot). Use when adding, renaming or restructuring a skill or AGENTS.md, deciding where a new convention should live, when code changes add or rename exports, routes, commands or environment variables, or when the user says "update docs", "sync documentation", "deduplicate docs" or "audit docs".
paths:
    - 'AGENTS.md'
    - 'CLAUDE.md'
    - 'README.md'
    - 'docs/**'
    - '.agents/**'
    - '.claude/**'
allowed-tools: Bash(bun run check:agents), Bash(git status *), Bash(git diff *)
---

# Update docs — the repo-kit standard

Every repo Kwan owns follows this one standard, so any session in any AI tool reads any repo the same way.
This skill and the delivery block in `AGENTS.md` are copied verbatim from the repo-kit repo and carry a stamp;
edit them there, never here. This repo's own half — what to touch when its code changes — is
[`local.md`](local.md).

## 1. Which layer an instruction belongs in

Decide this before writing anything. **A fact lives in exactly one place; everywhere else links to it.**

| The instruction is…                                        | Location                                        | Load cost                                              |
| :--------------------------------------------------------- | :---------------------------------------------- | :----------------------------------------------------- |
| A fact or guardrail every session needs                    | `AGENTS.md`                                     | Every session, every tool                              |
| A fact for one project folder of a monorepo                | `<dir>/AGENTS.md` (+ its `CLAUDE.md` shim)      | When a file in that folder is touched                  |
| A per-area convention, a path-scoped guardrail, a procedure | a skill in `.agents/skills/<name>/`            | Name + description listed; body when invoked           |
| Bulk detail behind a skill (tables, schemas, subsystems)   | `references/<topic>.md` beside `SKILL.md`       | When the skill links it and the model follows the link |
| Something that must happen **every time**, no exceptions   | a hook in `.claude/settings.json` (Claude only) | None — it runs, it is not read                         |
| A long task whose output would flood the conversation      | a subagent in `.claude/agents/` (Claude only)   | Its own context                                        |
| Human onboarding, setup, command index                     | `README.md`                                     | Never loaded by an agent                               |
| Cross-cutting reference or history                         | `docs/`                                         | Only when linked                                       |

Rules of thumb: an agent got it wrong twice → `AGENTS.md`; the same playbook pasted a third time → a skill;
"never do X" that must hold → a hook, and the same rule in words in `AGENTS.md` for the tools without hooks.

## 2. Size budgets

| File                         | Budget                                                       | Why                                  |
| :--------------------------- | :----------------------------------------------------------- | :----------------------------------- |
| `AGENTS.md`                  | **≤ 200 lines**, target 120, **≤ 24 KB**                      | Always on; Antigravity's file limit  |
| `<dir>/AGENTS.md`            | **≤ 200 lines**, target 80; the chain from the root ≤ 32 KiB  | Codex reads at most 32 KiB in all    |
| `CLAUDE.md` (any)            | **≤ 40 lines**: `@AGENTS.md` + Claude-only notes              | A shim, never content                |
| `.agents/skills/*/SKILL.md`  | **Target 100–150 lines, ceiling 500**                         | Loaded whole on every invocation     |

The Next.js block (`<!-- BEGIN:nextjs-agent-rules -->`) is not counted. Past the target, move detail into
`references/<topic>.md` and link it. **Never trade ground-truth accuracy for line count.**

## 3. Writing a skill

```yaml
---
name: api-conventions          # = the folder name, kebab-case
description: Conventions for the Elysia API under apps/api — modules, validation, errors. Use when adding or editing anything under apps/api, a route, a schema, or when asked how API code should look here.
paths:                         # required for *-conventions skills (Claude surfaces it on a match)
    - 'apps/api/**'
allowed-tools: Bash(bun run test *), Bash(git diff *)   # optional — COMMA-separated
disable-model-invocation: true # optional — destructive procedures: invoked by name only
---
```

- **The description is the trigger** — in every tool it is the only text in context until the skill loads.
  Third person, one sentence of capability, then `Use when <triggers>`: the words a person types, the folders
  and file types. ≤ 1,024 chars, key use case first. Quote it when it contains `#` or `: `.
- **Naming:** an area → `<area>-conventions` · a procedure → verb-object (`update-docs`, `add-feature`,
  `audit-seo`) · every repo's design skill is `design`. Never `helper`, `utils`, `tools`.
- **Body:** a one-paragraph scope, numbered sections, one default way (not a menu), a closing checklist.
  No dates or "currently" claims that rot — state the rule and cite the code. Say "invoke the X skill", not a
  tool's slash syntax.
- **Layout:** `references/` for detail, `scripts/` for code the skill runs (Bun TS for new scripts),
  `assets/` or `templates/` for files it copies. Link every bundled file from `SKILL.md`.
- **Ground truth:** verify every export, route, field and constraint against the code and cite the file and
  the symbol (`file.ts` › `symbol`), never `file.ts:line`. A wrong skill is worse than none.
- **Third-party text:** link it at its URL; vendor a copy only with its LICENSE beside it.
- **Secrets:** never in a skill or AGENTS.md — not even where they are kept.

## 4. Every tool reads the same files

Claude Code, Codex, Antigravity and Copilot all read `AGENTS.md` (nested ones from the closest folder) and
load skills from `.agents/skills/` — except Claude Code, which reads `CLAUDE.md` and `.claude/skills/`. So:

- **`CLAUDE.md` is a shim:** its first line is `@AGENTS.md`; below it only notes that apply to Claude Code
  alone (hooks, `EnterWorktree`, subagents). The same shim sits beside every nested `AGENTS.md`.
- **Each skill's source is `.agents/skills/<name>/`;** `.claude/skills/<name>` is a symlink to
  `../../.agents/skills/<name>`. Edit the source path — Claude's Edit tool will not write through a link.
- **Retired:** `GEMINI.md`, `CODEX.md`, `.github/copilot-instructions.md`, `.github/instructions/`,
  `.cursor*`, `.windsurfrules`, `.clinerules`, `.claude/rules/`, `.claude/commands/`, `.agents/AGENTS.md`,
  `.agents/rules/`. A file a tool writes for itself (Next's Next-only `apps/*/AGENTS.md`) is gitignored.
- **Ignore files:** none per tool. `.gitignore` keeps generated trees out of every tool's search; Claude's
  `permissions.deny` `Read(...)` rules in `.claude/settings.json` block big tracked trees outright.

## 5. AGENTS.md shape

Five headings, in order: `## Safety` (what is production, what needs Kwan's yes) · `## Delivery contract`
(base branch, the `gate` chain, deploy — then the stamped shared block) · `## Read before you edit` (one
table of skills, each linked at `.agents/skills/<name>/SKILL.md`) · `## Repository map` · `## Further
reading`. A qualifier is fine ("Production safety"); extra sections are fine.

## 6. Monorepos and model choice

- **The root `AGENTS.md` routes:** facts every project shares, the five headings, and a repository map that
  links each project's own `AGENTS.md`.
- **One `AGENTS.md` per project folder** (`apps/web/`, `services/api/`, …) with its `CLAUDE.md` shim: its
  commands, gate, deploy target and hard facts.
- **Skills and agents live at the root** (`.agents/skills/`, `.claude/agents/`), scoped with `paths:`. A
  nested `.agents/` or `.claude/` is not loaded from a root session, so the gate fails on one.
- **One toolchain per project:** JS/TS projects share the root Bun workspace; any other language keeps its
  manifest and lockfile inside its folder, and root `package.json` scripts are the single entry point.
- **Independent deploys:** each deployable has its own Dockerfile, deploy config whose watch paths cover only
  its folder and the packages it imports, and a CI workflow with a `paths` filter. `.dockerignore` lists
  `.agents/`, `.claude/`, `AGENTS.md` and `CLAUDE.md`.
- **Every subagent names `model:` and `effort:`**: `haiku`/`low` for read-only search, docs and link checks;
  `sonnet`/`medium` for routine code; `opus`/`high` for reviews where a mistake is costly (safety, money,
  security).

## 7. Sync after code changes

Docs move with the code, in the same commit. The generic cases:

- **A script added or renamed in `package.json`** → README command index.
- **An environment variable** → the app's `.env.example` and the deployment doc.
- **A route, module or export added, renamed or removed** → the owning `*-conventions` skill and any link to it.
- **A port, a service, a collection, a queue** → the `AGENTS.md` repository map and the doc that owns it.
- **A skill renamed** → its `.claude/skills` symlink, every link to it, and the table in `AGENTS.md`.

This repo's specific map is in [`local.md`](local.md).

## 8. Dedup recipe

1. `wc -l AGENTS.md .agents/skills/*/SKILL.md` against §2.
2. A section that is mostly tables or subsystem detail moves to `references/<topic>.md`.
3. A restatement becomes a link to its one home — the gate and delivery rules to `AGENTS.md`.
4. Re-verify what moved against the code (§3 ground truth).

## 9. Gate

```bash
bun run check:agents
```

[`scripts/check-agent-docs.ts`](scripts/check-agent-docs.ts) checks the AGENTS.md skeleton and budgets, the
CLAUDE.md shims, skill sources and their symlinks, frontmatter (real YAML parse, known keys, `name` = folder,
the `Use when` trigger, `paths:` on `*-conventions`, comma-separated `allowed-tools`, `model:` and `effort:`
on every subagent), links, anchors and `@imports`, unlinked bundled files, nested `.agents/` or `.claude/`,
retired files, empty husks, broken symlinks, the stamped core, and that `bun run gate` calls it.

## 10. Checklist

- [ ] Right layer (§1), stated once, linked everywhere else
- [ ] `name` = folder; description = capability + `Use when …`, quoted if it has `#` or `: `
- [ ] Within budget (§2); detail in `references/`, every bundled file linked
- [ ] Every claim verified against the code and cited `file` › `symbol`
- [ ] `AGENTS.md` links the new or renamed skill; its `.claude/skills` symlink exists
- [ ] `bun run check:agents` clean

<!-- repo-kit: version=2026.10.31 hash=d9ba96954c57 -->
