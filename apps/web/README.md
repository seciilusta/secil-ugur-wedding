# apps/web — the wedding website

A single-page Turkish wedding site that builds to plain static files. No server
rendering, no API routes, no Node runtime in production.

It talks to the RSVP API over documented HTTP only, and it learns the API's
address at runtime from `public/runtime-config.json` — so this directory can be
deployed and moved entirely on its own.

## Commands

```bash
pnpm install          # from the repository root
pnpm dev              # development server on :3000
pnpm build            # static export into out/
pnpm serve            # serve the built out/ directory on :3000
pnpm lint
pnpm typecheck
pnpm artwork          # regenerate the illustration and sharing image
```

## Deploying

```bash
pnpm build
```

Upload `out/` to any static host. Then edit `out/runtime-config.json` on the
server so it points at the deployed API:

```json
{ "rsvpApiBaseUrl": "https://api.secilveugur.com" }
```

The browser fetches that file on load, so the change is live immediately — the
API can move without rebuilding this app. If the file is missing or malformed,
the form is still rendered but shows a Turkish message explaining that the site
configuration is incomplete, rather than failing silently.

Before going live, set `share.siteUrl` in `src/config/site.ts` to the public
address so Open Graph images resolve to absolute URLs.

## Where things are

| File | Holds |
| --- | --- |
| `src/config/site.ts` | Every editable string: names, date, times, venue, all copy, all Turkish messages, Maps URLs, metadata |
| `src/app/globals.css` | Every colour, type scale and spacing token, in one labelled block at the top |
| `public/runtime-config.json` | The API base URL. The only deployment-dependent value |
| `src/lib/rsvp-client.ts` | The only code that calls the API |
| `src/lib/runtime-config.ts` | Loads and validates the runtime config |
| `src/components/sections/` | One file per section, in page order |
| `src/components/rsvp/RsvpForm.tsx` | The form, and the only component with meaningful state |
| `src/components/motion/` | Two small reveal wrappers |
| `public/artwork/source/` | The archival original illustration — never modified |

Only `RsvpForm`, `Reveal` and `IllustrationReveal` are client components.
Every section is a Server Component and ships no JavaScript.

## Fonts and language

Bodoni Moda for the couple's names and headings, Jost for everything else, both
loaded through `next/font` with the Latin Extended subset so `ç ğ ı İ ö ş ü`
render correctly. `<html lang="tr">`.

## Motion

Reveals are opacity and transform only, with a clip reveal for the
illustration. `prefers-reduced-motion: reduce` disables them.

Because reveal wrappers are prerendered with `opacity: 0` and cleared on
hydration, two safeguards keep the copy visible regardless: a `<noscript>` rule
in `layout.tsx` and a `prefers-reduced-motion` rule in `globals.css`, both
targeting `[data-reveal]`. If you add a new reveal, keep that attribute on it.

## The illustration

`public/artwork/source/venue-illustration.png` is the original and is never
touched. `scripts/optimize-artwork.mjs` produces what the site loads:

- trims the transparent outer padding only, leaving the visible artwork intact
- writes a lossless PNG master plus 1×/1.5×/2× transparent WebP copies, offered
  through `srcset` so high-density screens get a sharp image
- records intrinsic dimensions in `site.ts` so the box is reserved up front and
  the illustration causes no layout shift
- regenerates the Open Graph sharing image

A plain `<img>` is used rather than `next/image`, because static export cannot
optimize images at request time and the custom `srcset` is more appropriate
here than a generated one.
