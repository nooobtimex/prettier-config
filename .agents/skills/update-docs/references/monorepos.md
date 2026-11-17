# Monorepos

The layout every monorepo on the standard follows. The owning rule is `update-docs` §6.

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
