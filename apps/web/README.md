# apps/web

The Next.js wedding website and same-origin RSVP backend.

The page content remains statically generated, while `/health` and
`/v1/rsvp/*` are Node.js route handlers intended for Vercel Functions.
Responses are stored in Neon Postgres.

## Commands

Run from the repository root:

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm db:generate
pnpm db:migrate
```

Copy `.env.example` to `.env.local` for local database-backed submissions.
Never commit the resulting secrets.

## Important paths

- `src/config/site.ts`: wedding details and Turkish copy
- `src/app/globals.css`: design tokens and responsive styling
- `src/components/rsvp/RsvpForm.tsx`: form state and guest experience
- `src/lib/rsvp-client.ts`: same-origin HTTP client
- `src/server/rsvp/`: request validation, handlers, CSV generation
- `src/server/db/`: Neon repository and Postgres schema
- `migrations/`: checked-in Drizzle migrations
- `public/artwork/`: source and generated artwork

## Environment

- `DATABASE_URL`: Neon Postgres URL
- `RSVP_ADMIN_TOKEN`: secret used by the CSV export
- `RATE_LIMIT_SECRET`: secret HMAC key for client-address fingerprints
- `RSVP_MAX_GUESTS`: optional, defaults to 10

## Deployment

Create a Vercel project rooted at this directory, connect Neon through the
Vercel Marketplace, configure the secrets, run `pnpm db:migrate`, and deploy
the repository's default branch.

The form posts to `/v1/rsvp` on the current origin. No API base URL or CORS
allowlist is needed.
