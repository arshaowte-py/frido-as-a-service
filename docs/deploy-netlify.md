# Deploying to Netlify

Both halves run on one Netlify site:

- **Frontend** — `web/dist`, served from the CDN.
- **Backend** — the whole Express app as a single function at `netlify/functions/api.mjs`,
  reached via the `/api/*` redirect in `netlify.toml`.
- **Database** — Netlify DB (Postgres), provisioned automatically because
  `@netlify/database` is a dependency. There is no connection string to manage; the
  schema is applied from `netlify/database/migrations/` before a production deploy
  publishes.

The site already exists and is configured:

| | |
| --- | --- |
| Project | `frido-as-a-service` |
| Site ID | `4ee775ea-505d-4443-8949-7248dde922b8` |
| URL | https://frido-as-a-service.netlify.app |
| Admin | https://app.netlify.com/projects/frido-as-a-service |

Environment variables are set (`JWT_SECRET`, `ADMIN_TOKEN`, `DEMO_MODE`, `DEV_OTP_ECHO`,
`PUBLIC_BASE_URL`). `JWT_SECRET` and `ADMIN_TOKEN` are stored as secrets — read them from
the Netlify UI under *Project configuration → Environment variables*.

---

## Publishing a deploy

Connect the repository once, and every push to the branch deploys itself:

1. https://app.netlify.com/projects/frido-as-a-service → **Project configuration → Build
   & deploy → Continuous deployment → Link repository**
2. Pick `arshaowte-py/frido-as-a-service`, branch `claude/frido-mall-rental-platform-2ubkx5`.
3. Leave the build settings alone — `netlify.toml` already declares the build command
   (`npm run build:netlify`), publish directory (`web/dist`) and functions directory.

Or push a one-off deploy from a machine with the Netlify CLI:

```bash
npm install -g netlify-cli
netlify login
netlify link --id 4ee775ea-505d-4443-8949-7248dde922b8
netlify deploy --build --prod
```

## Filling the database

**Normally you don't have to.** Migrations create the tables, and the first request that
finds an empty database seeds the demo estate itself (demo mode only — a real deployment
should never invent 240 customers for itself). The write is one transaction and
`units.code` is UNIQUE, so racing cold starts can't double-seed.

To force it, or to rebuild from scratch, the guarded endpoint is still there:

```bash
curl -X POST https://frido-as-a-service.netlify.app/api/admin/seed \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

It is idempotent: with units already present it returns `{"seeded": false}` and changes
nothing. To rebuild from scratch, send `{"reset": true}`. With `ADMIN_TOKEN` unset the
route returns 404 and cannot run at all.

## When something is wrong, read /api/health

It is built to answer even when the database is unreachable or unmigrated, and it never
throws — an opaque 500 here would leave nothing to debug with. It returns 503 with an
`issues` array naming the problem:

```bash
curl https://<your-site>.netlify.app/api/health
```

| `issues[].key` | What it means |
| --- | --- |
| `DATABASE` | No `NETLIFY_DATABASE_URL`. Netlify DB isn't enabled for the site — the function has no writable disk, so there is no fallback. |
| `MIGRATIONS` | Tables don't exist. The deploy wasn't a production one, or migrations failed. |
| `SEED` | Schema is fine but empty, and auto-seeding failed. Check the function log. |
| `JWT_SECRET` | Not set. A key derived from the site ID is being used so sign-in still works — fine for a demo, not for real data. |
| `DEMO_MODE` | Confirms one-time codes are coming back in API responses rather than by SMS. |

None of these take the API down any more. A missing `JWT_SECRET` used to throw at module
load, which killed the whole function and surfaced in the browser as a bare
"Something went wrong" with nothing behind it.

Then confirm:

```bash
curl https://frido-as-a-service.netlify.app/api/health
# {"ok":true,"demo":true,"driver":"postgres","units":84,"issues":[...]}

SMOKE_BASE_URL=https://frido-as-a-service.netlify.app npm run smoke
```

The smoke suite is the real check — 53 assertions across both surfaces. It writes a
handful of demo rows (one guest, one borrow) each time it runs.

---

## What deploying changes about how it behaves

**`DEMO_MODE=true` keeps the OTP echo on.** Without an SMS gateway there is no other way
to sign in, so the code comes back in the API response. This is only acceptable because
every row behind it is synthetic. **Before any real customer data goes in**: set
`DEMO_MODE=false`, wire a real SMS provider, and put the site behind a password
(*Project configuration → Access & security → Visitor access*).

**The site is public.** The staff console shows lead names and phone numbers. They are
invented, but if you would rather not have it open, the password control above takes
about thirty seconds.

**OTP rate limiting is per warm instance.** It is an in-process map, so on serverless it
bounds one container rather than the whole site. Redis is the fix, listed in the README's
stub table.

**Postgres, not SQLite.** `npm run dev` still uses a local SQLite file with no setup —
the driver is chosen by whether a database URL is present. The SQL is written to run on
both, and `npm run check:schema` fails the build if `server/src/schema.sql` and the
Netlify migration drift apart.

## Changing the schema after the first production deploy

Netlify never re-runs an applied migration. Edit `server/src/schema.sql`, then add a
**new** directory under `netlify/database/migrations/` with the change, and point
`EXPECTED_MIGRATION` in `scripts/check-schema-sync.mjs` at the newest full-schema copy.

## Function notes

`serverless-http`, `express`, `cors`, `zod`, `qrcode` and `@netlify/database` are listed
in `external_node_modules`. They are CommonJS, and esbuild's ESM output cannot honour
their runtime `require()` calls — bundling `serverless-http` fails at cold start with
*"Dynamic require of http is not supported"*. Shipping them from `node_modules` avoids it.
