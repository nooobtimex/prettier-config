# Local sync map

prettier-config's half of [`update-docs`](SKILL.md). It is not stamped — edit it freely. Beyond the generic
cases in `SKILL.md` §7, when this repo's code changes:

- **A new parser, plugin, preset, locale or token model** → the recipe in
  [`playground-conventions`](../playground-conventions/SKILL.md), and the i18n keys in every
  `common/messages/*.json`.
- **A new `lib/` module or a change to the state flow** →
  [`architecture.md`](../playground-conventions/references/architecture.md).
- **A new route or a metadata change** → `buildPageMetadata()` and the traps in
  [`playground-conventions`](../playground-conventions/SKILL.md).
- **A domain, redirect or `SITE_URL` change** → the Safety section of `AGENTS.md` (Cloudflare rule order).
- **A Dockerfile or Railway change** → the Deploy bullet in `AGENTS.md` › Delivery contract.
- **A script added or renamed in `package.json`** → the Commands line in `AGENTS.md` › Repository map, and the
  README command index.
- Not ours: `next dev` upserts its "This is NOT the Next.js you know" block into the root `AGENTS.md`. Keep it
  there; the checker does not count it.
