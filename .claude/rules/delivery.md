# Delivery

The delivery rules every repo on the repo-kit standard shares. The repo-specific half — base branch, what is
production, the exact `gate` chain — is in `CLAUDE.md` under `## Delivery contract`.

- **Bun only:** `bun install` and `bun run …`; never npm, yarn or pnpm.
- **Never push without asking.** Work on a branch (`feat/*`, `fix/*`, `chore/*`), never straight on the base
  branch; open a PR only when Kwan asks.
- **Run `bun run gate` before committing.** It chains the repo's lint, test and build with
  `bun run check:agents`. Read the diff and the test counts, not only the exit code.
- **Split commits by concern, fundamental first:** core change → infra/Docker → CI → tooling → docs.
- **Docs move with the code:** a change updates the docs it makes stale in the same commit — the map is in
  [`/update-docs`](../skills/update-docs/SKILL.md).
- **Preserve unrelated changes.** Check `git status` before starting; never discard work you did not make.
- **Production data, migrations, secrets, domains, CORS, auth:** state the blast radius and get Kwan's yes
  first.

<!-- repo-kit: version=2026.10.19 hash=569728c298c2 -->
