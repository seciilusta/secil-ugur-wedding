# services/rsvp-api — the RSVP API

A standalone Fastify service that stores wedding RSVP responses in SQLite.

This directory is self-contained: its own `package.json`, TypeScript config,
migrations, tests, environment example and Dockerfile. It imports nothing from
the website and knows nothing about it beyond the origins allowed through CORS.
Copy this directory to any server and it runs.

## Quick start

```bash
pnpm install
cp .env.example .env
# Put a real token in .env:  openssl rand -hex 32
pnpm db:migrate
pnpm dev                      # http://localhost:4000

curl http://localhost:4000/health
```

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Watch mode via tsx |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled server |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:generate` | Generate SQL after editing `src/db/schema.ts` |
| `pnpm test` | Vitest integration tests |
| `pnpm lint` / `pnpm typecheck` | |

## Environment

See `.env.example` for the annotated list. Every value is validated at startup
and the process refuses to boot on an invalid environment.

`RSVP_ADMIN_TOKEN` is required, must be at least 24 characters, and the
placeholder from `.env.example` is rejected. `RSVP_MAX_GUESTS` is the
authoritative party-size limit and should match `rsvp.maxGuests` in
`apps/web/src/config/site.ts`. `WEB_ORIGINS` is a comma-separated CORS
allowlist; `*` is refused when `NODE_ENV=production`.

## Endpoints

Every response uses the same envelope: `{ "ok": true, "data": … }` or
`{ "ok": false, "error": { "code", "message" } }`.

### `GET /health`

```json
{ "ok": true, "data": { "status": "ok", "database": "ok", "uptime": 12.4 } }
```

### `GET /v1/rsvp/config`

Public form configuration. No secrets, no guest data.

```json
{ "ok": true, "data": { "maxGuests": 10 } }
```

### `POST /v1/rsvp`

`application/json` only — anything else is `415`. Body limit 16 KB. Rate
limited to 12 per 10 minutes per address, under a global 120 per minute.

| Field | Type | Rules |
| --- | --- | --- |
| `submissionToken` | string | Required, 16–128 chars |
| `fullName` | string | Required, 2–120 chars after whitespace normalisation |
| `attendance` | `"yes"` \| `"no"` | Required |
| `guestCount` | integer | 1…`RSVP_MAX_GUESTS` when attending; forced to 0 when not |
| `note` | string | Optional, ≤ 500 chars |
| `website` | string | Honeypot, must be empty |

Whitespace is collapsed without altering Turkish characters. A filled honeypot
gets an ordinary-looking success response and writes nothing.

Insert or update is keyed on `submissionToken` inside a transaction, so a
resubmission from the same browser updates that row and moves `updatedAt`. The
guest's name is never used as a key.

```bash
curl -X POST http://localhost:4000/v1/rsvp \
  -H 'Content-Type: application/json' \
  -d '{"submissionToken":"a-long-random-token","fullName":"Elif Şahinoğlu",
       "attendance":"yes","guestCount":2,"note":"","website":""}'
```

`201` created / `200` updated:

```json
{ "ok": true, "data": { "status": "created", "attendance": "yes", "guestCount": 2 } }
```

Errors: `400 VALIDATION_ERROR` (with a `fields` map), `413`, `415`,
`429 RATE_LIMITED`, `500 INTERNAL_ERROR`. SQLite errors are logged internally
and returned as the generic message.

### `GET /v1/rsvp/export.csv`

```bash
curl -H "Authorization: Bearer $RSVP_ADMIN_TOKEN" \
     -o katilimlar.csv \
     http://localhost:4000/v1/rsvp/export.csv
```

Bearer token only, compared in constant time; never read from the query string,
so it cannot end up in access logs or browser history. `401` with no data
otherwise.

UTF-8 with a BOM and CRLF endings so Turkish characters open correctly in
Excel. Values starting `=`, `+`, `-` or `@` are prefixed against formula
injection. Sorted oldest first. Columns: `Sıra`, `Ad Soyad`, `Katılım`,
`Kişi Sayısı`, `Not`, `İlk Gönderim`, `Son Güncelleme`.

## Database

One table, `rsvps`, with a unique index on `submission_token`. Timestamps are
ISO 8601 UTC strings. WAL mode is enabled; the parent directory of
`DATABASE_PATH` is created if missing; an existing database is opened as-is and
never replaced. `SIGTERM`/`SIGINT` close it cleanly.

Migrations live in `migrations/`, are committed, and run automatically at
startup as well as via `pnpm db:migrate`.

Backup while running — do not just copy the `.sqlite` file, since recent writes
may still be in the `-wal` sidecar:

```bash
sqlite3 data/rsvp.sqlite ".backup 'data/rsvp-$(date +%Y%m%d-%H%M).sqlite'"
```

Restore: stop the service, put the backup at `DATABASE_PATH`, delete any stale
`-wal` and `-shm` files, start again.

## Docker

```bash
docker build -t rsvp-api .
docker run -d --name rsvp-api \
  -p 4000:4000 \
  -v rsvp-data:/data \
  -e DATABASE_PATH=/data/rsvp.sqlite \
  -e RSVP_ADMIN_TOKEN="$(openssl rand -hex 32)" \
  -e WEB_ORIGINS=https://secilveugur.com \
  -e NODE_ENV=production \
  rsvp-api
```

Multi-stage build, non-root user, `/data` volume for the database, and a
`HEALTHCHECK` that polls `/health`.

## Tests

```bash
pnpm test
```

Each test builds an app against its own temporary SQLite file and drives it
through `app.inject()`, so no port is opened and runs cannot interfere with each
other. Covered: health, attending and not-attending submissions, invalid guest
counts, missing fields, the honeypot, updating by token, CSV export with and
without authorisation, Turkish characters end to end, CSV escaping, unsupported
media types, and CORS behaviour.
