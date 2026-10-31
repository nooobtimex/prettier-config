# prettier-config — agent guide

> **prettier-config.dev** — a browser-based Prettier playground and config builder: pick a Prettier version
> and options visually, paste code, see a GitHub-style diff, copy or share the `.prettierrc`. Everything runs
> **client-side** — `prettier/standalone` and every parser plugin are fetched at runtime from jsDelivr for
> whatever Prettier 3.x version the user picks. Live at https://prettier-config.dev, deployed from `main` on
> Railway. This repo is **public**.

## Safety

- **The domain is `prettier-config.dev`.** `prettier-config.nooobtimex.me` 301-redirects here through a
  Cloudflare Redirect Rule on the `nooobtimex.me` zone; both hostnames stay attached to the Railway service,
  so that rule is the only thing preventing duplicate content. `SITE_URL` (`lib/seo.ts`) is the single
  source. Never change it without flipping the Cloudflare rules in the same session, in this order: ship
  code, delete the old rule, _then_ add the reverse one — the reverse rule first is an infinite loop.
- **`public/ads.txt` is authoritative** — `prettier-config.dev` is a root domain, so crawlers read this file.
- **Never bundle Prettier for runtime formatting** — user code is formatted by the CDN-loaded copy through
  `loadPrettier()`. `prettier` and `prettier-plugin-tailwindcss` are regular dependencies only so build-time
  codegen can resolve them (`gen:options` and `gen:articles` format their output with the `.prettierrc` plugin;
  without it they fail with `ERR_MODULE_NOT_FOUND`) — `bun fmt` does not need either; after a
  build `.next/standalone/node_modules/prettier` must not exist and no client chunk may contain
  `STATIC_PRETTIER_OPTIONS`.
- **No env vars are required.** Railway injects `PORT` and `server.js` reads it — never pin `PORT` in the
  image. `.env` sets `PORT=2000` for local dev only; `.dockerignore` keeps it out of the image.

## Delivery contract

- Base branch: `main`.
- Gate: `bun run gate` = `lint` (`eslint --fix && bun fmt`) → `build` (`gen:options` →
  `gen:articles` → `typecheck` → `next build`) → `check:agents`. There is **no test suite** and no CI —
  verify behaviour in `bun dev` (port 2000).
- **Formatting** ([`.prettierrc`](.prettierrc), read by `bun fmt`): tabs, width 2, printWidth 100, single quotes,
  semicolons, `trailingComma: all`, `singleAttributePerLine: true`, Tailwind class sorting (built into `bun fmt`).
- **ESLint** ([`eslint.config.mjs`](eslint.config.mjs)): `no-explicit-any` and unused vars are errors
  (prefix `_` to ignore), `no-console` warns (`warn`/`error` allowed). ESLint does not run Prettier (`eslint-config-prettier` only switches
  off its style rules); formatting is `bun fmt`.
- **TypeScript 7 runs side by side with TypeScript 6 — don't "fix" the alias.** typescript-eslint needs a
  JS compiler API that TS 7 lacks, so `typescript` is `npm:@typescript/typescript6` (bin `tsc6`) and TS 7 is
  `@typescript/native` (bin `tsc`). `next.config.ts` sets `typescript.ignoreBuildErrors` and `build` runs
  `typecheck` (`next typegen && bun check`, Bun's own checker) first, so a type error still fails the build. Collapse to plain
  `typescript@7` once typescript-eslint supports it.
- **Bun 1.4.4 is pinned** in `packageManager`, `.tool-versions` and both Dockerfile stages (`oven/bun:1.4.4-slim`) —
  move them together. `bunfig.toml` holds `minimumReleaseAge = "3d"`, so an install refuses a package version
  published less than 3 days ago.
- **Deploy:** Railway only, one service from `main`. [`.railway/railway.ts`](.railway/railway.ts) is the IaC
  (Railway does not read it on deploy: `railway config plan`, then `railway config apply`). The
  [`Dockerfile`](Dockerfile) is Bun installs → Bun builds → **Node serves** (`node:26-slim`; Bun's HTTP layer
  leaks RSS, oven-sh/bun#27514). The build stage copies the `node` binary from `node:26-slim` — bump the two
  Debian releases together. `output: 'standalone'` does not copy `.next/static` or `public/`, so the runner
  copies both by hand. Exercise the image:
  `docker build -t prettier-config . && docker run --rm -e PORT=2000 -p 2000:2000 prettier-config`.

<!-- repo-kit:delivery -->

**Shared delivery rules** — the same in every repo on the repo-kit standard; edit them in the repo-kit repo,
never here. The repo-specific half is the rest of this section.

- **Bun for JS and TS:** `bun install` and `bun run …`; never npm, yarn or pnpm. A project in another language
  uses the toolchain its own `AGENTS.md` names, through the root `package.json` scripts.
- **Never push without asking.** Work on a branch (`feat/*`, `fix/*`, `chore/*`), never straight on the base
  branch; open a PR only when Kwan asks.
- **Run `bun run gate` before committing.** It chains the repo's lint, test and build with
  `bun run check:agents`. Read the diff and the test counts, not only the exit code.
- **Split commits by concern, fundamental first:** core change → infra/Docker → CI → tooling → docs.
- **Docs move with the code:** a change updates the docs it makes stale in the same commit — the map is the
  `update-docs` skill ([`.agents/skills/update-docs/SKILL.md`](.agents/skills/update-docs/SKILL.md)).
- **Preserve unrelated changes.** Check `git status` before starting; never discard work you did not make.
- **Production data, migrations, secrets, domains, CORS, auth:** state the blast radius and get Kwan's yes
  first.
- **Never read, print or copy `.env*`, keys, tokens or credentials.**

<!-- repo-kit: version=2026.10.31 hash=9a19d2c92a7e -->

## Read before you edit

Invoke the skill for the area before editing in it.

| Skill in `.agents/skills/`                                                 | Covers                                                                                              | Purpose                                                                    |
| :------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| [`playground-conventions`](.agents/skills/playground-conventions/SKILL.md) | `app/**`, `components/**`, `hooks/**`, `lib/**`, `common/**`, `content/**`, `i18n/**`, `scripts/**` | recipes (parser, plugin, preset, locale, token model), architecture, traps |
| [`update-docs`](.agents/skills/update-docs/SKILL.md)                       | `AGENTS.md`, `docs/**`, `.agents/**`                                                                | the repo-kit standard — where an instruction belongs, budgets, skills      |

## Repository map

**Stack:** Next.js 16 (App Router, `output: 'standalone'`, `typedRoutes`), React 19, TypeScript 7 (strict),
ESLint 10 flat config, Tailwind v4 (CSS-first in `app/globals.css`), shadcn/ui (`base-nova`) on
`@base-ui/react`, CodeMirror 6, next-intl (20 locales, `localePrefix: 'always'`), Bun.

```text
app/[locale]/        locale-aware routes — page.tsx is the server shell; (components)/Playground.tsx the app;
                     options/ (hub + /options/[option]), about, faq, privacy
components/          feature components (CodeEditor, CodeDiff, *Dialog, *Picker, Prettier*); ui/ = shadcn
hooks/               usePersistedConfig, usePrettierVersion, useShareableUrl, useDiffSettings, useTokenCount …
content/options/     long-form option articles, one dir per locale (the site's own prose)
lib/                 core non-React logic; generated/ = gen:options + gen:articles output
common/              constants, enums, interfaces, messages/ (next-intl JSON; en.json is the source)
i18n/                next-intl request.ts + navigation.ts
next-intl.config.ts  locales + defaultLocale
proxy.ts             next-intl middleware (matcher skips api, _next, static and dotted paths)
.railway/railway.ts  Railway service config (IaC)
.agents/skills/      the skills every AI tool loads (linked into .claude/skills for Claude Code)
```

Commands: `bun install` · `bun dev` (port 2000) · `bun run build` · `bun start` · `bun run lint` ·
`bun run typecheck` · `bun run gen:options` · `bun run gen:articles`.

## Further reading

- [`README.md`](README.md) — what the site does, for humans.
- [`playground-conventions` → architecture](.agents/skills/playground-conventions/references/architecture.md)
  — data flow, `lib/` modules, the option articles and their invariants, ads.
