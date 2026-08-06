# Jira Tracker

Receives Jira webhooks and records how long each issue spends in each status, then builds a
monthly summary: time in development, in QA, waiting on the client.

It never calls the Jira API — everything is built from webhooks, so the system only knows what
happened since it was installed.

## Stack

**Server** — Node + TypeScript · Fastify · Drizzle ORM · SQLite (better-sqlite3).
**Web** — React · Vite · TanStack Query/Table/Router · Tailwind.
**Shared** — Biome · Docker · pnpm workspace.

## Running it

```bash
pnpm install
cp .env.example .env          # fill in JIRA_WEBHOOK_SECRET
pnpm db:push                  # creates/updates the tables (no migrations)
pnpm db:mapping               # loads the status-to-category mapping
pnpm dev                      # API on :3000
pnpm dev:web                  # dashboard on :5173, proxies /reports to :3000
```

In production a single process serves both: `pnpm build` builds the web bundle and the server, and
Fastify serves `web/dist` at `/`. Without a web build the server still runs — it logs
`web build not found, skipping static routes` and only exposes the API.

With Docker:

```bash
export JIRA_WEBHOOK_SECRET=$(openssl rand -hex 32)
docker compose up --build
```

The container applies the schema and the status mapping on every boot (both steps are
idempotent) and keeps the database in the `jira-tracker-data` volume.

## Dashboard

`/` serves a React dashboard with two views, `?span=month` and `?span=day`, plus free-text search
and toggles per project and per category. Filters live in the URL, so any view is a shareable link
(`/?date=2026-08-05&span=day&categories=["testing"]`).

Filtering happens entirely in the browser over the period's JSON — a month is tens of issues, not
thousands, so there is no filtering API. Changing period or span is the only round trip.

**The month timeline uses a compressed axis.** Nights and weekends are removed from the axis
entirely, so every column is one working day and the whole width is time that can actually hold
work. A calendar axis gives each day 1/31 of the width, of which only a third is working hours, so
a 6h task renders about 14px wide and everything collapses into slivers; compressed, the same task
gets roughly 4x the width and the day grid becomes readable. The axis is driven by the report's
top-level `work_intervals`.

**The day view** is an hour axis over the working day, with the lunch break drawn as a gap. Issues
that run concurrently share the block and are stacked in lanes so all of them stay visible — a
purely visual split: each issue's total still counts its full hours (see the concurrency note
below).

The server-rendered view stays available at `/reports/monthly?month=YYYY-MM&format=html` for
printing or PDF — it is A4 landscape, uses the calendar axis, and does not depend on JavaScript.

Category colours and the working schedule come from the API (`category_colors`, `work_schedule`)
so `src/db/status-mapping.data.ts` and `src/utils/business-hours.ts` stay the single source of
truth for both views.

## Lint and formatting

Biome handles both, across the server and the web app:

```bash
pnpm lint      # check
pnpm format    # check --write
```

Biome is used instead of ESLint + Prettier because `typescript-eslint` does not support
TypeScript 7 yet, and Biome parses TypeScript with its own parser.

## Working hours

Only time that falls inside working hours is counted: **Monday to Friday, 09:00–13:00 and
14:00–18:00** in `REPORT_TIMEZONE` (`America/Montevideo`). Nights, weekends and the lunch break
add nothing. An issue left in "En curso" on Friday at 18:00 does not accumulate again until
Monday at 09:00.

The schedule lives in `src/utils/business-hours.ts` (`WORK_SHIFTS`, `WORK_DAYS`) and applies to
every status, regardless of category, so the whole report is expressed in the same unit.

Like categories, the clipping happens **on every query**, not when the webhook arrives: changing
the schedule recalculates the whole recorded history. Nothing about `status_history` changes.

Public holidays are not handled — only Saturdays and Sundays are excluded.

### Concurrent issues

One issue has at most one open segment, but several issues can be in the same status at once. The
tracker measures *how long each issue spent in each status*, so those hours are counted once per
issue and totals can exceed the hours actually available in the period: two issues in progress
across the same 8-hour day report 8h each, and the period total says 16h.

That is faithful to what the data records — nothing ever told the system which of the two you were
actually working on. The day view makes it visible by stacking concurrent issues in lanes instead
of hiding the overlap.

## Setting up the webhook in Jira

*Settings → System → Webhooks → Create a Webhook*

- **URL**: `https://your-host/webhooks/jira`
- **Event**: *Issue → updated*
- **Header**: `X-Webhook-Secret: <the JIRA_WEBHOOK_SECRET value>`

Events without a `status` change in the changelog are answered with `{ "ignored": true }` and
never touch the database. Jira retries on 5xx, so a processing failure is logged but still
answered with 200.

### Seeing what Jira sends

With `LOG_WEBHOOK_BODY=true` (the default) every request to the webhook logs a `webhook received`
line with the raw body, the `webhookEvent`, the `content-type`, whether the secret header was
present and whether it matched. It is logged **before** the secret is validated, so a 401 from a
misconfigured secret shows up too.

```bash
docker compose logs -f jira-tracker | grep "webhook received"
```

If the event arrives but does not change the status, an `event without status change, ignored`
line is logged with the fields that did change — useful to confirm the webhook is wired up
correctly even before any card has moved.

The body is truncated at 20 kB. Once validated in production, set `LOG_WEBHOOK_BODY=false` to
keep the log clean.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET` | `/health` | Liveness check + database reachable |
| `POST` | `/webhooks/jira` | Receives events (requires the secret header) |
| `GET` | `/reports/monthly?month=YYYY-MM` | The whole month as JSON, or `&format=html` for the printable view |
| `GET` | `/reports/range?date=YYYY-MM-DD&span=day\|month` | Arbitrary period as JSON; what the dashboard uses |

`month` and `date` are optional and default to today. `span` defaults to `month`. The server
resolves the period in `REPORT_TIMEZONE`, so the browser never does timezone math.

```bash
curl 'http://localhost:3000/reports/monthly?month=2026-08'
```

Segments are clipped twice: **to the month** (a segment that started on Jul 28 and ended on Aug 4
contributes only its August part) and **to working hours**. `clipped_from` / `clipped_to` are the
calendar bounds within the month; `work_intervals` holds the pieces that actually count, and
`seconds` is their sum. Open segments come back with `"open": true` and are counted up to the
moment of the query.

The `done` category is **terminal**: the task died there, so its segment comes back with
`"terminal": true`, `"seconds": 0` and an empty `work_intervals`, and adds to no total. An issue
whose only segment in the month is terminal does not appear in the report at all (finished in
July, it does not pollute August). Terminal categories are configured in `TERMINAL_CATEGORIES`,
in `src/db/status-mapping.data.ts`.

```jsonc
{
  "month": "2026-08",
  "from": "2026-08-01T03:00:00.000Z",
  "to": "2026-09-01T03:00:00.000Z",
  "issues": [
    {
      "issue_key": "PUN-123",
      "project_key": "PUN",
      "summary": "Arreglar login",
      "current_status_name": "Testing",
      "total_seconds": 86400,
      "by_category": { "development": 86400 },
      "segments": [
        {
          "status_id": "10002",
          "status_name": "En curso",
          "category": "development",
          "entered_at": "2026-07-25T17:20:00.000Z",
          "left_at": null,
          "clipped_from": "2026-08-01T03:00:00.000Z",
          "clipped_to": "2026-08-06T00:08:47.263Z",
          "work_intervals": [
            { "from": "2026-08-03T12:00:00.000Z", "to": "2026-08-03T16:00:00.000Z" },
            { "from": "2026-08-03T17:00:00.000Z", "to": "2026-08-03T21:00:00.000Z" }
          ],
          "open": true,
          "terminal": false,
          "seconds": 86400
        }
      ]
    }
  ],
  "totals_by_category": { "development": 86400 },
  "totals_by_project": { "PUN": 86400 }
}
```

## Categories: `status_mapping`

Every project names the same thing differently (`En curso`, `In Progress`). The `status_mapping`
table translates those names into internal categories, which are what the reports show. Status
names stay exactly as Jira writes them; categories are always in English.

| Jira status | Category |
|---|---|
| Backlog · To Do · Por hacer · Estimar | `pending` |
| Pendiente de info · Pending for info | `waiting_info` |
| En curso · In Progress | `development` |
| To Deploy | `deploy` |
| Testing · Validar | `testing` |
| Listo · Done · Hecho | `done` (terminal) |

The source of truth is `src/db/status-mapping.data.ts`. To add a status or change its category,
edit that file and run:

```bash
pnpm db:mapping
```

It is idempotent: it inserts what is missing, updates what changed, and leaves alone any rows
added by hand outside the file. In Docker it runs on every boot.

Statuses show up on their own in the `statuses` table as they appear, so that is where to look
for anything left unmapped:

```sql
SELECT * FROM statuses;
```

An unmapped status is reported as `uncategorized` (the time is not lost, just unclassified).

Resolution order: first by `jira_status_id`; with no match, by name (case-insensitive, edges
trimmed). The file maps by name; if two projects ever use the same name for different things, add
a row with the Jira id, which takes precedence.

**Reports resolve the category on every query**, not when the webhook arrives: loading the
mapping recategorizes the entire recorded history too.

## Data model

- **`issues`** — one row per issue, with its current status.
- **`status_history`** — one segment per stay in a status (`entered_at`, `left_at`,
  `duration_seconds`). At most one open segment per issue. Durations here are raw calendar
  seconds; the working-hours clipping happens at report time.
- **`statuses`** — catalogue of statuses seen, fills itself in.
- **`status_mapping`** — Jira status → internal category. Loaded with `pnpm db:mapping`.

`pnpm db:studio` opens the Drizzle viewer for all of this.

## Later on

The architecture (routes / services / repositories) is meant to grow without touching what is
already there: React dashboard, Excel/CSV export, per-sprint or per-developer metrics, filters by
project and date, public holidays in the working-hours calendar. None of that is implemented yet.

Two known limits worth knowing before extending it:

- The report endpoint is month-scoped. `buildMonthlyReport` already works internally on a `Range`,
  so accepting `?from=&to=` for arbitrary ranges is a small change — it is the one filter that
  cannot be done client-side.
- Nothing is authenticated. The webhook has a shared secret; `/reports` and the dashboard do not.
