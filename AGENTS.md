# Repository Guidelines

## Project Structure & Module Organization

This pnpm workspace contains one Next.js application in `apps/web`. App Router routes and API handlers live in `apps/web/src/app`; reusable UI is grouped under `src/components` (`hero`, `sections`, `rsvp`, `timeline`, and `motion`). Keep wedding copy and public configuration in `src/config/site.ts`, and shared visual tokens in `src/app/globals.css`. Server-only RSVP, validation, and database code belongs in `src/server`; small pure utilities belong in `src/lib`.

Tests are in `apps/web/test`. Static illustrations and optimized venue assets are in `apps/web/public/artwork`; source assets stay in `public/artwork/source`. Browser-layout verification is maintained in `tools/verify.mjs`.

## Wedding Experience Rule

Read `.cursor/rules/wedding-experience.mdc` before changing invitation copy or schedule; section canvases, color tokens, artwork, masks, overflow, z-index, or typography; scroll/reduced-motion behavior; responsive layout; timeline/countdown logic; RSVP presentation; or visual verification. It contains the product invariants, continuity constraints, required breakpoints, and delivery checks. It is not needed for isolated dependency, database, CI, or tooling-only work that cannot affect the visitor experience.

## Build, Test, and Development Commands

- `pnpm dev` — run the website locally through the workspace root.
- `pnpm build` — build the production Next.js bundle.
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — run repository-wide quality checks.
- `pnpm --filter web test` — run Vitest tests for the web app only.
- `node tools/verify.mjs` — start a production server and check responsive layout, motion, contrast, and form controls in Chrome.
- `pnpm db:generate` and `pnpm db:migrate` — generate or apply Drizzle migrations. Use only with the intended database environment.

## Coding Style & Naming Conventions

Use TypeScript and functional React components. Follow existing two-space indentation, double quotes, semicolons, and the `@/` import alias. Use PascalCase for components (`VenueMap.tsx`), camelCase for functions and values, and descriptive kebab-case asset names. Extend existing CSS tokens in `globals.css`; do not introduce ad-hoc colors in components. Preserve Turkish copy and date formatting in `site.ts` unless the content change is deliberate.

## Testing Guidelines

Name tests `*.test.ts` and keep API tests independent by mocking external services where practical. Add or update tests for time logic, validation, and API behavior. For visual changes, run `node tools/verify.mjs`; check both mobile and desktop screenshots when changing canvases, artwork masks, or motion.

## Commit & Pull Request Guidelines

Use short imperative commit subjects, e.g. `Fix venue directions coordinates` or `Refine invitation canvas transitions`. Keep commits focused. PRs should explain the user-visible change, note any configuration or migration impact, link the relevant issue when available, and include before/after screenshots for visual work.

## Security & Configuration

Never commit `DATABASE_URL`, `RSVP_ADMIN_TOKEN`, or `RATE_LIMIT_SECRET`. Keep secrets in local environment configuration or Vercel. Live RSVP verification creates data; remove its verification row after confirming the protected CSV export.
