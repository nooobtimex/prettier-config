# prettier-config — Claude Code guide

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
  `loadPrettier()`. `prettier` is a regular dependency only so build-time codegen can resolve it; after a
  build `.next/standalone/node_modules/prettier` must not exist and no client chunk may contain
  `STATIC_PRETTIER_OPTIONS`.
- **No env vars are required.** Railway injects `PORT` and `server.js` reads it — never pin `PORT` in the
  image. `.env` sets `PORT=2000` for local dev only; `.dockerignore` keeps it out of the image.

## Delivery contract

- Base branch: `main`. Generic rules: [`.claude/rules/delivery.md`](.claude/rules/delivery.md).
- Gate: `bun run gate` = `lint` (eslint --fix && prettier --write .) → `build` (`gen:options` →
  `gen:articles` → `typecheck` → `next build`) → `check:agents`. There is **no test suite** and no CI —
  verify behaviour in `bun dev` (port 2000).
- **Formatting** ([`.prettierrc`](.prettierrc)): tabs, width 2, printWidth 100, single quotes, semicolons,
  `trailingComma: all`, `singleAttributePerLine: true`, `prettier-plugin-tailwindcss`.
- **ESLint** ([`eslint.config.mjs`](eslint.config.mjs)): `no-explicit-any` and unused vars are errors
  (prefix `_` to ignore), `no-console` warns (`warn`/`error` allowed), `prettier/prettier` is an error.
- **TypeScript 7 runs side by side with TypeScript 6 — don't "fix" the alias.** typescript-eslint needs a
  JS compiler API that TS 7 lacks, so `typescript` is `npm:@typescript/typescript6` (bin `tsc6`) and TS 7 is
  `@typescript/native` (bin `tsc`). `next.config.ts` sets `typescript.ignoreBuildErrors` and `build` runs
  `typecheck` (TS 7, after `next typegen`) first, so a type error still fails the build. Collapse to plain
  `typescript@7` once typescript-eslint supports it.
- **Deploy:** Railway only, one service from `main`. [`.railway/railway.ts`](.railway/railway.ts) is the IaC
  (Railway does not read it on deploy: `railway config plan`, then `railway config apply`). The
  [`Dockerfile`](Dockerfile) is Bun installs → Bun builds → **Node serves** (`node:26-slim`; Bun's HTTP layer
  leaks RSS, oven-sh/bun#27514). The build stage copies the `node` binary from `node:26-slim` — bump the two
  Debian releases together. `output: 'standalone'` does not copy `.next/static` or `public/`, so the runner
  copies both by hand. Exercise the image:
  `docker build -t prettier-config . && docker run --rm -e PORT=2000 -p 2000:2000 prettier-config`.

## Read before you edit

| Rule in `.claude/rules/`                   | Loads on      | Carries                                                                 |
| :----------------------------------------- | :------------ | :---------------------------------------------------------------------- |
| [`delivery.md`](.claude/rules/delivery.md) | every session | Bun only, never push unasked, branch → PR, commit order, docs with code |

| Skill in `.claude/skills/`                                                  | Loads on                                          | Purpose                                                                    |
| :-------------------------------------------------------------------------- | :------------------------------------------------ | :------------------------------------------------------------------------- |
| [`/playground-conventions`](.claude/skills/playground-conventions/SKILL.md) | `app/**`, `components/**`, `lib/**`, `hooks/**` … | recipes (parser, plugin, preset, locale, token model), architecture, traps |
| [`/update-docs`](.claude/skills/update-docs/SKILL.md)                       | `CLAUDE.md`, `docs/**`, `.claude/**`              | the repo-kit standard — where an instruction belongs, budgets, skills      |

**Stack:** Next.js 16 (App Router, `output: 'standalone'`, `typedRoutes`), React 19, TypeScript 7 (strict),
ESLint 10 flat config, Tailwind v4 (CSS-first in `app/globals.css`), shadcn/ui (`base-nova`) on
`@base-ui/react`, CodeMirror 6, next-intl (20 locales, `localePrefix: 'always'`), Bun.

## Repository map

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
```

Commands: `bun install` · `bun dev` (port 2000) · `bun run build` · `bun start` · `bun run lint` ·
`bun run typecheck` · `bun run gen:options` · `bun run gen:articles`.

## Further reading

- [`README.md`](README.md) — what the site does, for humans.
- [`/playground-conventions` → architecture](.claude/skills/playground-conventions/references/architecture.md)
  — data flow, `lib/` modules, the option articles and their invariants, ads.
