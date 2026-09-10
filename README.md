# RemindAm

> **Your daily sales assistant.** Know exactly who to follow up with today.

RemindAm helps Nigerian SMEs identify the customers and leads they should contact
every day — hot leads, reorders due, unpaid customers, and reactivations — with a
suggested WhatsApp message for each.

This repository is a monorepo with three independent parts:

```
frontend/   Next.js 15 (App Router) — UI, presentation, API calls
backend/    NestJS 10 + Prisma — API, business logic, database access
shared/     TypeScript package — enums, constants, and cross-cutting types
```

**Architecture rule:** the frontend never touches the database. All application
data flows through the backend HTTP API and Prisma. Authentication uses Clerk
(added in Phase 1); Postgres (Supabase in production) is the source of truth for
business data.

---

## Prerequisites

- **Node.js** ≥ 20 (built with v24) and npm
- **PostgreSQL** — one of:
  - A local PostgreSQL server on `localhost:5432`, **or**
  - Docker (use the bundled `docker-compose.yml`), **or**
  - A Supabase project (production/staging)

---

## Getting started

### 1. Clone and install

```bash
git clone <repo-url> RemindAmApp
cd RemindAmApp

# Install every workspace (shared is built first — backend/frontend depend on it)
npm run install:all
npm run build:shared
```

### 2. Configure environment variables

Copy the relevant sections of `.env.example` into two files:

- `backend/.env`
- `frontend/.env.local`

`.env.example` documents every variable. At minimum the backend needs
`DATABASE_URL`; the frontend needs `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:4000`).

### 3. Provide a database

**Option A — Docker (recommended for a clean machine):**

```bash
npm run db:up        # starts Postgres 16 on localhost:5432
```

`DATABASE_URL` in `.env.example` already matches this container
(`remindam:remindam@localhost:5432/remindam`).

**Option B — an existing local PostgreSQL server:**

Create a dedicated role and database (run as a superuser such as `postgres`):

```sql
CREATE ROLE remindam LOGIN PASSWORD 'remindam';
ALTER ROLE remindam CREATEDB;              -- needed for Prisma's shadow database
CREATE DATABASE remindam OWNER remindam;
```

Then point `DATABASE_URL` at it (the default value already matches the above).

**Option C — Supabase:**

Set `DATABASE_URL` to your Supabase connection string:

```
postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
```

> Only one Postgres can own `localhost:5432` at a time — don't run the Docker
> container and a native Postgres on the same port simultaneously.

### 4. Run migrations

```bash
cd backend
npx prisma migrate dev     # applies migrations and generates the Prisma client
```

### 5. Start the apps

From the repo root, in two terminals:

```bash
npm run dev:backend    # http://localhost:4000/api
npm run dev:frontend   # http://localhost:3000
```

### 6. Verify

- Backend health: <http://localhost:4000/api/health> → `{"status":"ok","database":"up"}`
- Frontend status page: <http://localhost:3000/status> (shows live backend + DB status)

---

## Useful scripts (repo root)

| Command | Description |
| --- | --- |
| `npm run install:all` | Install root + all three workspaces |
| `npm run build:shared` | Compile the shared package to `dist/` |
| `npm run dev:backend` | Start NestJS in watch mode |
| `npm run dev:frontend` | Start Next.js dev server |
| `npm run build` | Production build of shared + backend + frontend |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` | Lint backend + frontend |
| `npm run test` | Run backend tests |
| `npm run db:up` / `npm run db:down` | Start/stop the Docker Postgres |
| `npm run format` | Prettier write across the repo |

---

## Project status

Built in phases. Each phase is a full vertical slice — UI → API → database →
validation → tests → typecheck → lint → build → manual verification — and is
signed off before the next begins.

- **Phase 0 — Foundation** ✅ Monorepo, both apps, shared package, Prisma schema
  + initial migration, Docker Postgres, linting/formatting, health endpoint, and
  a live status page.
- **Phase 1 — Authentication** ✅ Clerk sign-in/up on the frontend; the backend
  verifies the session token and syncs the user into Postgres on the first
  authenticated request (`GET /api/me`).
- **Phase 2 — Business + onboarding** ✅ A guided onboarding wizard creates a
  business and its `OWNER` membership atomically; the dashboard resolves the
  caller's businesses server-side and redirects new users into onboarding.
- **Phase 3 — Application shell** ✅ A protected `(app)` route group with a
  desktop sidebar, a mobile navigation drawer, and a top bar (active-business
  switcher + Clerk user menu). The active business is resolved and re-validated
  on the server and shared across every authenticated route; each navigation
  destination (Today, Customers, Leads, Sales, Products, Imports, Analytics,
  Settings) renders inside the shell. _Typecheck, lint, and production build
  green._
- **Phase 4 — Customer system** ✅ Full customer CRUD as a vertical slice:
  business-scoped `/api/customers` (create, paginated list, case-insensitive
  search by name/phone/email, read, update, delete) that re-validates the
  caller's membership on every request via an `x-business-id` header — never
  trusting the client's business id (§46). The Customers screen adds debounced
  search, pagination, an accessible create/edit dialog, a delete confirmation,
  and honest empty / no-match / loading / error states. _Backend unit tests,
  typecheck, lint, and production build green._

**Next:** Phase 5 — Products.

> **Roadmap note — marketing site.** The public landing page (master prompt §14)
> is not assigned a phase in §43. It is scheduled for **after Phase 12 — Today /
> Dashboard**, the first point at which the hero screenshots show the real
> recommendation engine rather than a mock. Pricing stays static copy until
> Phase 17 wires the configurable subscription plans. Until then `/` is a
> placeholder hero, not the §14 site.

### Authenticated routes

| Route | Status |
| --- | --- |
| `/dashboard` | Workspace landing (active business) |
| `/customers` | Customer CRUD — search, paginate, add, edit, delete |
| `/today` · `/leads` · `/sales` · `/products` · `/imports` · `/analytics` · `/settings` | In the shell; feature ships in its phase |
| `/account` | Clerk-synced profile |
| `/onboarding` | Business setup wizard (shown when you have no business) |

> Open the app at **`http://localhost:3000`**, not the LAN/"Network" URL that
> `next dev` also prints — a session minted at a LAN origin fails the backend's
> Clerk `authorizedParties` check and every authenticated call returns 401.
