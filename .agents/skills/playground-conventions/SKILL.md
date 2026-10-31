---
name: playground-conventions
description: Conventions and recipes for the prettier-config.dev playground — add a Prettier parser, third-party plugin, preset, locale or token-counter model; the CDN-loaded Prettier flow; the version, options, share and diff flow; page metadata, option articles and ads. Use when editing anything under app, components, hooks, lib, common, content or i18n, or when adding one of those features.
paths:
  - 'app/**'
  - 'components/**'
  - 'hooks/**'
  - 'lib/**'
  - 'common/**'
  - 'content/**'
  - 'i18n/**'
  - 'scripts/**'
  - 'next-intl.config.ts'
  - 'proxy.ts'
---

# Playground conventions

The repeatable changes to **prettier-config.dev**, a fully client-side Prettier playground, and the traps
already hit. How state flows, what each `lib/` module does, why the option articles exist and how ads are
wired: [`references/architecture.md`](references/architecture.md).

## Ground rules

- **Prettier is CDN-loaded at runtime** from jsDelivr per version — never bundle it or `import 'prettier'`
  to format user code. All formatting goes through `loadPrettier()` in
  [lib/prettierLoader.ts](../../../lib/prettierLoader.ts).
- **No tests.** Verify with `bun dev` (port 2000) and the real UI.
- **Format before finishing:** `bun run lint` (`eslint --fix && bun fmt`). Tabs, single quotes,
  printWidth 100, `no-explicit-any` is an error.
- **i18n is mandatory** for user-facing strings: add keys to every `common/messages/*.json` (20 locales),
  with `en.json` as the source of truth.

## Recipe: add a parser (new language in "Your Code")

1. `lib/parsers.ts` — add the id to the `ParserId` union, add an entry to `PARSERS` (with extensions), and
   extend `detectParser()` if it can be auto-sniffed (put cheap/specific checks first; `typescript` is the
   fallback).
2. `lib/prettierLoader.ts` — add the parser → plugin-file mapping in `PARSER_PLUGINS`. If it needs a built-in
   plugin not already in `PLUGIN_FILES`, add the `.mjs` filename there too.
3. Add a deliberately mis-formatted **Preview sample** so every relevant option has something to demonstrate
   on (see `lib/sample.ts` / the Preview tab samples).
4. Add the `Page.parserPicker.parsers.<id>` label to all `common/messages/*.json`.

## Recipe: add a third-party Prettier plugin

1. Register it in [lib/plugins.ts](../../../lib/plugins.ts): id, npm name, and the jsDelivr CDN URL of its
   browser/ESM build.
2. That's usually it — the loader passes every registered plugin to `getSupportInfo`, so its options
   auto-render in the form, and `generateConfig` adds its npm name to the config's `plugins` array.
3. Plugins that fail to load (Node-only deps, network) are caught by `Promise.allSettled` in the loader,
   toasted, and auto-deselected — confirm yours actually has a browser-safe build before adding it.

## Recipe: add a preset

Add a `{ id, options }` entry to `PRESETS` in [lib/presets.ts](../../../lib/presets.ts) and the
`Page.presets.<id>` label/description to every locale JSON. Options unknown to the loaded version are
auto-stashed (excluded from output) by `validKeys`.

## Recipe: add a locale

1. Add the code to the `locales` array in [next-intl.config.ts](../../../next-intl.config.ts) (`ar` and `fa`
   are RTL).
2. Create `common/messages/<code>.json` by copying `en.json` and translating every key (keys must match).
3. Add it to the language list used by `LanguageSwitcher` / `common/constants/languages.ts`.
4. Option articles are additive: add `content/options/<code>/*.ts` and those URLs re-enter the index on the
   next build (architecture → The option articles).

## Recipe: add a token-counter model

Edit [lib/tokenizers.ts](../../../lib/tokenizers.ts): add the id to `TokenModelId` and an entry to
`TOKEN_MODELS`. Use `approximate: false` only if you wire a real offline tokenizer (lazy-`import()` it like
the `gpt-tokenizer` encoders); otherwise `approximate: true` uses the `chars/N` heuristic.

## Where things live

- Playground state, `generateConfig` and the version switch (`handleVersionRequest`):
  [app/[locale]/(components)/Playground.tsx](<../../../app/[locale]/(components)/Playground.tsx>); the conflict
  warning: [lib/versionDiff.ts](../../../lib/versionDiff.ts).
- Config import/paste: [lib/configImporter.ts](../../../lib/configImporter.ts) (never `eval`s input — JS
  modules go through Prettier's own json5 parser).
- Share URL: [hooks/useShareableUrl.ts](../../../hooks/useShareableUrl.ts) (lz-string hash).
- Persistence: [hooks/usePersistedConfig.ts](../../../hooks/usePersistedConfig.ts) (`useSyncExternalStore`,
  key `prettier-config-state`).
- Options form generation: [lib/adaptSupportInfo.ts](../../../lib/adaptSupportInfo.ts) — the form is built
  from each version's `getSupportInfo()`, so new Prettier options appear without code changes.
- shadcn/ui primitives live in `components/ui/` — generated, prefer regenerating over hand-editing.

## Traps already hit

- **Page metadata goes through `buildPageMetadata()`** in [lib/seo.ts](../../../lib/seo.ts). Next _replaces_
  `robots`/`openGraph`/`twitter` rather than merging, so a route that sets one by hand loses the layout's
  `googleBot` directives and `og:image`. The layout declares **no** `alternates` on purpose.
- **The home route stays a server shell** (`app/[locale]/page.tsx` owns metadata, JSON-LD and `<h1>`); making
  it a client component again would take the per-locale canonical with it.
- **`dynamicParams = false`** on `app/[locale]/layout.tsx` is load-bearing: without it `/anything.foo`
  renders the home page with HTTP 200 and `<html lang="anything.foo">`.
- **Never add `public/robots.txt`** — it shadows `app/robots.ts` and drops the `Sitemap:` directive.
- `/:locale/config` permanently redirects to `/:locale` (`next.config.ts`).
- **`/ads.txt` is reachable only because `proxy.ts`'s matcher skips dotted paths** — loosening that regex
  redirects it to `/en/ads.txt` and breaks Google's crawler.
- **The AdSense publisher ID is spelled two ways:** `ca-pub-…` in the meta tag, the loader's `?client=` and
  every `data-ad-client`; bare `pub-…` in `public/ads.txt`. A wrong ads.txt fails silently as "Earnings at
  risk". Anchor and vignette Auto ads overlay the `h-screen` UI — keep them off; in-content units only.
- **ESLint 10 needs the pinned `settings.react.version`** in `eslint.config.mjs` — eslint-plugin-react 7.37
  detects via `context.getFilename()`, which ESLint 10 removed. Expect peer-dependency warnings until the
  plugins catch up.

## Verify

```bash
bun dev          # exercise the changed flow in the browser at :2000
bun run gate     # lint → build → check:agents
```
