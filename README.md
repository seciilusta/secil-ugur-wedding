# Seçil & Uğur — düğün sitesi

A single-page Turkish wedding website and a standalone RSVP API.

The two halves are deliberately independent. The website is a plain static
export that can sit on any web server; the API is a small Node service with its
own SQLite file. Neither imports the other, and the website finds the API
through a JSON file it reads at runtime — so the API can move to a different
host without rebuilding the site.

- **Website:** Next.js (App Router, `output: "export"`), Tailwind CSS v4,
  Motion for React, React Hook Form, Zod.
- **API:** Fastify, Drizzle ORM, SQLite (`better-sqlite3`), Zod, Vitest.
- **Workspace:** pnpm. The root exists only as a development convenience.

---

## Directory structure

```
secil-ugur-wedding/
├── apps/web/                     Static website — deployable on its own
│   ├── public/
│   │   ├── runtime-config.json   Where the API lives (edited after deploy)
│   │   └── artwork/
│   │       ├── source/           Archival original illustration, untouched
│   │       └── *.webp            Optimized display copies
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css       ALL colours, type and spacing tokens
│   │   │   ├── layout.tsx        Fonts, metadata, Open Graph
│   │   │   └── page.tsx          Section assembly, top to bottom
│   │   ├── components/
│   │   │   ├── sections/         One file per page section
│   │   │   ├── rsvp/RsvpForm.tsx The form and its existing submission flow
│   │   │   ├── timeline/         Scroll-progress wedding-day schedule
│   │   │   └── motion/           Section-specific choreography primitives
│   │   ├── config/site.ts        ALL wedding information and copy
│   │   └── lib/
│   │       ├── runtime-config.ts Loads and validates runtime-config.json
│   │       └── rsvp-client.ts    The only place that talks to the API
│   └── scripts/optimize-artwork.mjs
│
├── services/rsvp-api/            REST API — deployable on its own
│   ├── src/
│   │   ├── server.ts             Entry point, graceful shutdown
│   │   ├── app.ts               Fastify wiring, CORS, rate limit, errors
│   │   ├── config/env.ts         Environment validation
│   │   ├── db/                   Schema, connection, migration runner
│   │   ├── routes/               health, rsvp, export
│   │   ├── schemas/rsvp.ts       Request validation
│   │   └── utils/csv.ts          CSV escaping
│   ├── migrations/               Generated Drizzle SQL — commit these
│   ├── test/                     Vitest integration tests
│   ├── .env.example
│   └── Dockerfile
│
└── tools/verify.mjs              End-to-end check: builds, screenshots, RSVP
```

---

## What to edit

| To change | Edit |
| --- | --- |
| Event information (names, date, times, venue) | `apps/web/src/config/site.ts` |
| Any website copy or Turkish message | `apps/web/src/config/site.ts` |
| Google Maps links | `apps/web/src/config/site.ts` → `maps` |
| Colours, typography, spacing | `apps/web/src/app/globals.css` |
| Where the API lives | `apps/web/public/runtime-config.json` |
| Venue illustration | `apps/web/public/artwork/` |
| Database and API settings | `services/rsvp-api/.env` |
| Reading RSVP responses | SQLite file, or the protected CSV export |

Nothing editable is hidden in a component. `site.ts` holds every string on the
page, and `globals.css` holds every colour and spacing value in one labelled
block at the top.

---

## First-time setup

Requires Node 20+ and pnpm 9+.

```bash
pnpm install

# The API needs an environment file before it will start.
cd services/rsvp-api
cp .env.example .env
```

Then open `services/rsvp-api/.env` and replace the admin token — the service
refuses to boot while it is still the placeholder:

```bash
openssl rand -hex 32
```

Create the database:

```bash
pnpm db:migrate      # from the repository root
```

---

## Development commands

Run from the repository root:

| Command | Does |
| --- | --- |
| `pnpm dev` | Website on :3000 and API on :4000, together |
| `pnpm dev:web` | Website only |
| `pnpm dev:api` | API only |
| `pnpm build` | Production build of both |
| `pnpm build:web` | Static export into `apps/web/out/` |
| `pnpm build:api` | Compile the API into `services/rsvp-api/dist/` |
| `pnpm test` | Website behavior tests and the 39-test API suite |
| `pnpm lint` | Lint both |
| `pnpm typecheck` | Type-check both |
| `pnpm db:migrate` | Apply pending migrations |

`pnpm dev` is the normal way to work: the website's development server proxies
nothing, it simply reads `public/runtime-config.json`, which already points at
`http://localhost:4000`.

### Running each one independently

Neither needs the other to be present.

```bash
# Website alone. The RSVP form shows a Turkish "cannot reach the server"
# message and keeps whatever the guest typed.
pnpm --filter web dev

# API alone.
cd services/rsvp-api && pnpm dev
curl http://localhost:4000/health
```

### Verifying the whole thing

```bash
pnpm build:web
node tools/verify.mjs
```

This builds the site, serves the static export, starts the API against a
throwaway database, drives real Chrome at 390×844, 430×932, 768×1024 and
1440×900, writes screenshots to `.screenshots/`, and then completes an actual
RSVP through the rendered form — including validation, resubmission, contrast
measurement, reduced motion, an unreachable API and a missing runtime config.
It requires Google Chrome to be installed.

---

## Production build and deployment

### Website

```bash
pnpm build:web            # → apps/web/out/
```

`apps/web/out/` is a directory of static files. Upload it to any web server,
static host or CDN. There is no Node runtime, no server rendering and no API
route in it.

After uploading, edit `runtime-config.json` **on the server** to point at the
deployed API:

```json
{ "rsvpApiBaseUrl": "https://api.secilveugur.com" }
```

That file is read by the browser on every page load, so changing it takes
effect immediately. **You never need to rebuild the site to move the API.**

Also set `share.siteUrl` in `site.ts` to the public address before going live,
so the Open Graph image resolves to an absolute URL for social networks.

### API

```bash
pnpm build:api
cd services/rsvp-api
pnpm db:migrate
NODE_ENV=production pnpm start
```

Or with Docker, which is the tidier option because it carries its own Node:

```bash
cd services/rsvp-api
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

The image declares a `/data` volume, exposes 4000, runs as a non-root user and
has a `HEALTHCHECK` that polls `/health`. Migrations run automatically at
startup, and `SIGTERM` closes the database cleanly.

Put the API behind HTTPS. `trustProxy` is enabled in production so rate
limiting sees the real client address through a reverse proxy.

---

## Environment variables

All of these live in `services/rsvp-api/.env`. The website has no environment
variables at all — its only deployment-dependent value is
`public/runtime-config.json`.

| Variable | Default | Notes |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface to bind |
| `PORT` | `4000` | Listening port |
| `DATABASE_PATH` | `./data/rsvp.sqlite` | Parent directory is created if absent; an existing file is opened, never replaced |
| `RSVP_ADMIN_TOKEN` | — | **Required.** Minimum 24 characters, and the placeholder is rejected. Guards the CSV export |
| `RSVP_MAX_GUESTS` | `10` | Authoritative party-size limit. Keep equal to `rsvp.maxGuests` in `site.ts` |
| `WEB_ORIGINS` | `http://localhost:3000` | Comma-separated CORS allowlist. `*` is refused when `NODE_ENV=production` |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | `info` | Guest names, notes and tokens are redacted from logs |

An invalid environment stops the process at startup with an explanation, rather
than failing later on a request.

---

## Adding the Google Maps links

Both fields start empty, and the venue section is built for that: it shows a
tasteful placeholder at the correct proportions and hides the directions link
instead of rendering something broken.

Open `apps/web/src/config/site.ts` and find the `maps` block near the bottom.

**`embedUrl`** — In Google Maps, search the venue → **Share** → **Embed a map**
→ copy *only* the `src="…"` value out of the generated `<iframe>`, not the whole
tag:

```ts
maps: {
  embedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!...",
  directionsUrl: "",
},
```

**`directionsUrl`** — In Google Maps, open the venue → **Directions** →
**Share** → copy the link:

```ts
directionsUrl: "https://maps.app.goo.gl/xxxxxxxx",
```

The iframe appears as soon as `embedUrl` is filled; the "Google Maps'te Yol
Tarifi Al" link appears as soon as `directionsUrl` is filled. Rebuild the site
afterwards (`pnpm build:web`).

---

## The RSVP API

Base URL comes from `runtime-config.json`. All responses are JSON in a fixed
envelope: `{ "ok": true, "data": … }` or
`{ "ok": false, "error": { "code", "message" } }`.

### `GET /health`

Confirms the process is up and the database is readable.

```json
{ "ok": true, "data": { "status": "ok", "database": "ok", "uptime": 12.4 } }
```

### `GET /v1/rsvp/config`

Public form configuration. Carries no secrets and no guest data.

```json
{ "ok": true, "data": { "maxGuests": 10 } }
```

### `POST /v1/rsvp`

`Content-Type: application/json`. Body limit 16 KB. Rate limited to 12 requests
per 10 minutes per address, under a global ceiling of 120 per minute.

| Field | Type | Rules |
| --- | --- | --- |
| `submissionToken` | string | Required. 16–128 chars. Random, generated in the browser |
| `fullName` | string | Required. 2–120 chars after whitespace normalisation |
| `attendance` | `"yes"` \| `"no"` | Required |
| `guestCount` | integer | Required when attending: 1…`RSVP_MAX_GUESTS`. Forced to 0 when not attending |
| `note` | string | Optional, up to 500 chars |
| `website` | string | Honeypot. Must be empty |

```bash
curl -X POST http://localhost:4000/v1/rsvp \
  -H 'Content-Type: application/json' \
  -d '{
        "submissionToken": "a-long-random-token-from-the-browser",
        "fullName": "Elif Şahinoğlu",
        "attendance": "yes",
        "guestCount": 2,
        "note": "Vejetaryen menü mümkün mü?",
        "website": ""
      }'
```

`201` on a first submission, `200` on an update:

```json
{ "ok": true, "data": { "status": "created", "attendance": "yes", "guestCount": 2 } }
```

The response describes only the submission that was just made; the endpoint
never returns another guest's information. Errors: `400 VALIDATION_ERROR` (with
a `fields` map), `415 UNSUPPORTED_MEDIA_TYPE`, `413 PAYLOAD_TOO_LARGE`,
`429 RATE_LIMITED`, `500 INTERNAL_ERROR`. Database errors are logged and
replaced with the generic message.

### `GET /v1/rsvp/export.csv`

Requires `Authorization: Bearer <RSVP_ADMIN_TOKEN>`. The token is compared in
constant time and is never accepted through the query string, so it cannot leak
into server logs or browser history. Without it the response is `401` with no
data.

---

## Exporting the RSVP responses

```bash
curl -H "Authorization: Bearer $RSVP_ADMIN_TOKEN" \
     -o katilimlar.csv \
     https://api.secilveugur.com/v1/rsvp/export.csv
```

The file has Turkish column headings, a UTF-8 BOM and CRLF line endings, so
Turkish characters open correctly in Excel by double-click. Values beginning
`=`, `+`, `-` or `@` are prefixed so a spreadsheet cannot execute them as a
formula. Rows are sorted oldest first.

Columns: `Sıra`, `Ad Soyad`, `Katılım`, `Kişi Sayısı`, `Not`, `İlk Gönderim`,
`Son Güncelleme`.

To read the database directly instead:

```bash
cd services/rsvp-api
sqlite3 data/rsvp.sqlite "select full_name, attendance, guest_count from rsvps order by id;"
```

---

## Database

One table, `rsvps`: `id`, `submission_token` (unique), `full_name`,
`attendance`, `guest_count`, `note`, `created_at`, `updated_at`. Timestamps are
ISO 8601 UTC strings, which sort as text and stay unambiguous when the file
moves between machines. WAL mode is on.

### Migrations

```bash
pnpm db:migrate                              # apply pending migrations
cd services/rsvp-api && pnpm db:generate     # after editing src/db/schema.ts
```

Generated SQL lands in `services/rsvp-api/migrations/` and is committed.
Migrations also run automatically when the service starts.

### Backup

SQLite in WAL mode should not be backed up by copying the `.sqlite` file alone —
recent writes may still be in the `-wal` sidecar. Use the online backup, which
is safe while the service is running:

```bash
cd services/rsvp-api
sqlite3 data/rsvp.sqlite ".backup 'data/rsvp-$(date +%Y%m%d-%H%M).sqlite'"
```

From a Docker container:

```bash
docker exec rsvp-api node -e "
  const D = require('better-sqlite3');
  const db = new D('/data/rsvp.sqlite', { readonly: true });
  db.exec(\"vacuum into '/data/backup.sqlite'\");
  db.close();
"
docker cp rsvp-api:/data/backup.sqlite ./rsvp-backup.sqlite
```

### Restore

```bash
cd services/rsvp-api
# Stop the service first.
mv data/rsvp.sqlite data/rsvp.sqlite.old
cp rsvp-backup.sqlite data/rsvp.sqlite
rm -f data/rsvp.sqlite-wal data/rsvp.sqlite-shm
# Start the service.
```

The service never truncates or replaces an existing database — it opens what is
there and applies any missing migrations.

---

## Moving the API to another server

1. Copy `services/rsvp-api/` to the new host, or build and push the Docker
   image. Nothing outside that directory is needed.
2. Create `.env` there. Set `WEB_ORIGINS` to the origin serving the website and
   `DATABASE_PATH` to a path on persistent storage.
3. Bring the database along if you already have responses (see Backup above).
4. `pnpm install --prod && pnpm db:migrate && pnpm start`, or `docker run`.
5. On the **website** host, edit `runtime-config.json`:

   ```json
   { "rsvpApiBaseUrl": "https://api.new-host.com" }
   ```

6. Confirm: `curl https://api.new-host.com/health`, then submit a test RSVP
   through the site.

No frontend code changes and no frontend rebuild. Step 5 is the entire
frontend-side change.

---

## Replacing the venue illustration

The original file is kept untouched in
`apps/web/public/artwork/source/venue-illustration.png`. The copies the site
actually loads are generated from it:

```bash
pnpm --filter web artwork
```

The script trims the transparent outer padding without touching any visible
part of the artwork, writes a lossless PNG master plus 1×/1.5×/2× transparent
WebP copies for high-density screens, records the intrinsic dimensions so the
layout reserves the correct box and never shifts, and regenerates the Open
Graph sharing image.

To use a different illustration, replace the file in `source/`, run the command
above, and update `artwork.illustrationWidth` / `illustrationHeight` in
`site.ts` if the script reports different dimensions.

---

## Duplicate prevention, and what it is not

Everyone receives the same public URL — there are no personal links, invitation
codes or guest logins. To stop one household submitting three times by
accident, the browser generates a random token on first use, keeps it in
`localStorage`, and sends it with every submission. The column is unique, so a
second submission from the same browser updates that row rather than adding
another.

The limits, stated plainly: it is per-browser, not per-person. A guest using
their phone and then their laptop creates two rows. Clearing site data creates a
new row. It is **not** authentication and does not stop a determined person from
submitting repeatedly. If `localStorage` is unavailable (private browsing, for
instance) the form still works — it falls back to a token held in memory for
that page load.

Two people with the same name are stored as two separate rows, because the name
is never used as a key.

---

## Values that still need your input

| What | Where | Notes |
| --- | --- | --- |
| **Google Maps embed URL** | `site.ts` → `maps.embedUrl` | Placeholder shows until filled |
| **Google Maps directions URL** | `site.ts` → `maps.directionsUrl` | Link hidden until filled |
| **Public site address** | `site.ts` → `share.siteUrl` | Needed for Open Graph images to resolve on social networks |
| **Admin token** | `services/rsvp-api/.env` | `openssl rand -hex 32`. Service will not start without a real one |
| **Production CORS origins** | `services/rsvp-api/.env` → `WEB_ORIGINS` | The origin(s) serving the website |
| **API base URL** | `apps/web/public/runtime-config.json` | Currently `http://localhost:4000` |
| **RSVP deadline** | `site.ts` → `rsvp.intro` | Currently reads 4 Eylül 2026 — change or remove the date |
| **Full postal address** | `site.ts` → `venue.address` | Worth confirming against the venue's own wording |
| **Footer closing line** | `site.ts` → `footer.closing` | Currently "Sizi aramızda görmek en büyük hediyemiz olacak." |

Everything else is filled in and working.
