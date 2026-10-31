# Playground architecture

Part of [`/playground-conventions`](../SKILL.md): how state flows through the one main screen, what each `lib/` module does, why the option articles exist and the invariants that keep them, and how ads are wired.

## Data flow

The home route is a server shell: [app/[locale]/page.tsx](../../../../app/[locale]/page.tsx) owns `generateMetadata`, the JSON-LD and the `<h1>`. The interactive screen is [app/[locale]/(components)/Playground.tsx](<../../../../app/[locale]/(components)/Playground.tsx>) (`'use client'`).
It composes three pieces of state and wires the dialogs/panels:

1. **Persisted config** — [hooks/usePersistedConfig.ts](../../../../hooks/usePersistedConfig.ts)
   holds `{ version, selected, pluginIds }` in `localStorage` via
   `useSyncExternalStore` (one JSON blob, key `prettier-config-state`, SSR-safe).
2. **Versioned Prettier** — [hooks/usePrettierVersion.ts](../../../../hooks/usePrettierVersion.ts)
   → [lib/prettierLoader.ts](../../../../lib/prettierLoader.ts). Given a version + extra plugin
   URLs, it CDN-loads `standalone.mjs` + parser plugins, memoizes per
   `(version, plugins)` key, and returns `{ options, format, status, error, pluginFailures }`.
3. **Shareable URL** — [hooks/useShareableUrl.ts](../../../../hooks/useShareableUrl.ts) packs
   `version + selected + code + parserOverride + pluginIds` into an LZ-compressed
   URL hash (`lz-string`). On first mount the hash wins; afterward state is mirrored
   back to it (debounced). Personal prefs (diff view, token model) are deliberately
   **not** shared.

`generateConfig()` in `Playground.tsx` turns `selected` into the `.prettierrc` JSON,
filtering to keys valid in the loaded version (`validKeys`) and appending any
selected plugins' npm names under `plugins`.

## Key library modules ([lib/](../../../../lib/))

- **prettierLoader.ts** — CDN loader. `PLUGIN_FILES` = built-in plugins always
  fetched; `PARSER_PLUGINS` = which plugin files each parser needs at format time.
  Third-party plugins are best-effort (`Promise.allSettled`); failures surface in
  `pluginFailures` and the UI toasts + auto-deselects them. Uses
  `new Function('u','return import(u)')` to dodge bundler static analysis of the URL.
- **parsers.ts** — `ParserId` union, `PARSERS` registry, and `detectParser()`
  content sniff (front-matter / JSON root / HTML tags / Vue blocks / GraphQL / YAML;
  defaults to `typescript`).
- **adaptSupportInfo.ts** — turns a version's `getSupportInfo()` output into the
  form's `PrettierOptionType[]` (optionally filtered by `since` version).
- **configImporter.ts** — parses a pasted config (JSON / JSON5 / JSONC /
  package.json `prettier` key / `module.exports`/`export default`) into
  `{ applied, ignored, preserved, pluginIds }`. **Never `eval`s user input** — JS
  modules are unwrapped and canonicalized through Prettier's own `json5` parser.
- **presets.ts** — one-click starter configs (`PRESETS`).
- **plugins.ts** — third-party plugin registry (id ↔ npm name ↔ CDN URL lookups).
- **tokenizers.ts** — `gpt-tokenizer` exact BPE for GPT models; `chars/N`
  approximation for Claude/Gemini/Llama/Mistral. Exact encoders lazy-`import()`ed.
- **versionDiff.ts** — `computeVersionConflicts()`: which active selections would
  vanish when switching versions (drives the warning dialog).
- **seo.ts** — `buildPageMetadata`, canonical + hreflang, shared og:image.
- **optionRoutes.ts** — slug mapping for `/options/[option]`, related options,
  and the playground deep link (mirrors `useShareableUrl`'s LZ payload).
- **optionArticle.ts** — resolves `(locale, optionKey)` to that locale's article,
  else the English one, reporting which happened via `isFallback`. Also exports
  the synchronous `hasOptionArticle()` coverage check that `app/sitemap.ts` uses.
- **generated/articleRegistry.ts** — build-time scan of `content/options/`.
  Exports `ARTICLE_COVERAGE` (plain data: which locales have which articles) and
  `ARTICLES` (locale → key → lazy `import()`, every specifier a string literal).
  Regenerate with `bun run gen:articles`; chained into `build`.
- **generated/prettierOptions.ts** — build-time snapshot of `getSupportInfo()`
  plus real formatted examples. Regenerate with `bun run gen:options` (chained
  into `build`). Bumping the `prettier` dependency is the whole maintenance step.
- **sortConfig.ts**, **timing.ts**, **utils.ts** (`cn`), **optionOverrides.ts**, **sample.ts**.

## The option articles

Each of the 26 routed Prettier options has an original ~900-word article at
`content/options/<locale>/<optionKey>.ts`, rendered on `/[locale]/options/[option]`
by [components/ArticleBody.tsx](../../../../components/ArticleBody.tsx).

They exist because the site was hit with an AdSense **"Low value content"**
violation in September 2026. 520 of 600 sitemap URLs were per-option pages whose
only prose was one sentence copied from prettier.io — 17 words of unique content
per page, none of it ours. Google Search had independently indexed 9 of those
600 URLs, marking 579 "Discovered — currently not indexed".

Two invariants keep that from coming back:

1. **Article prose never goes in `common/messages/*.json`.** `i18n/request.ts`
   imports each locale's messages whole, and `NextIntlClientProvider` serialises
   them into all 622 prerendered pages — so anything added there is paid for 622
   times. Articles live in their own tree, outside next-intl.
2. **`ArticleBody` and everything under it stay Server Components.** Passing
   article data to a client component as a non-`children` prop would move ~6 KB
   of prose per page into a JS chunk. Assert it: after a build, no phrase from an
   article may appear anywhere in `.next/static/`.

**Per-locale gating.** A locale with no article for an option serves the English
one and the page then emits `noindex, follow` and drops out of both the sitemap
and the hreflang cluster — all three driven by `ARTICLE_COVERAGE`, so they cannot
drift apart. The page still works for readers; it just stops competing as a
near-duplicate. Translating a locale is therefore additive: add
`content/options/<locale>/*.ts`, and those URLs re-enter the index on the next
build with no second list to update.

## Ads (Google AdSense)

Client-side only, like everything else here.

- **[common/constants/adsense.ts](../../../../common/constants/adsense.ts)** — `ADSENSE.CLIENT_ID`
  plus `AD_SLOTS`, the registry of `data-ad-slot` IDs. A `null` slot renders
  nothing, so placements can be committed before the unit exists in the AdSense
  dashboard. The publisher ID is public, so it is a constant, not an env var —
  the "no env vars required" deploy story stays true.
- **[components/AdSenseScript.tsx](../../../../components/AdSenseScript.tsx)** — the
  `adsbygoogle.js` loader, `afterInteractive`, rendered from the root layout.
  Required for Auto ads _and_ manual units. Returns `null` outside production.
- **[components/AdSlot.tsx](../../../../components/AdSlot.tsx)** — one `<ins class="adsbygoogle">`.
  Guards against Strict Mode double-push (`data-adsbygoogle-status`) and defers
  the push through a `ResizeObserver` until the container has non-zero width,
  because AdSense bails permanently on `availableWidth=0`.
- **[public/ads.txt](../../../../public/ads.txt)** — authorized-sellers file.
