# MERIDIAN Web

Marketing site for [meridian.dev](https://meridian.dev). Local-only in the monorepo git remote — deploy separately.

Links to `/docs` — a coming-soon waitlist until Starlight goes live. Set `VITE_DOCS_URL` when docs are public.

## Local dev

```bash
cd packages/web
npm install
npm run dev
```

Visit [http://localhost:5173/docs](http://localhost:5173/docs) for the waitlist page.

### Waitlist API (local)

The email form POSTs to `/api/waitlist`. On Vercel this runs as a serverless function. Locally, use `vercel dev` or configure `WAITLIST_WEBHOOK_URL` in Vercel env vars to forward signups to Slack, Zapier, etc.

## Auth & dashboard

- `/login` — sign in
- `/register` — create beta account
- `/dashboard` — API keys, usage, resources (requires login)

### Vercel setup (required for auth)

1. **Storage** → Add **Upstash Redis** from the [Vercel Marketplace](https://vercel.com/marketplace?category=storage&search=redis) (provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`)
2. **Environment variables** (Production + Preview):
   - `AUTH_SECRET` — random 32+ char string (`openssl rand -base64 32`)
   - KV vars are auto-injected when you link storage

3. Redeploy after adding env vars

Local dev with API routes: `npx vercel dev` (not `npm run dev` alone)

## What's on the site

- **Docs** nav tab → Starlight documentation (quickstart, CLI, API, SDKs, GitHub Action)
- **Developers** → CLI, `@meridian/stellar`, `meridian-py`, REST API, GitHub Action cards
- **Pipeline** → TRACE → FIELD → GRAVITY → BRIEF overview
- Updated integrations, outcomes (TTL checks), and install CTAs

## Vercel

Run these from `packages/web` only. Do not run from the monorepo root.

First time — log in and link the project:

```bash
cd packages/web
npm install
npx vercel login
npx vercel link
```

Preview deploy:

```bash
npm run deploy
```

Production deploy:

```bash
npm run deploy:prod
```

**Important:** Use the npm scripts above. Do not add extra words after the command — Vercel treats them as paths and fails with `Can't deploy more than one path`.

Because `packages/web` is gitignored from the main remote, deploy with the CLI from this folder (it uploads local files). Do not connect the main `meridian-core` repo to Vercel without including this folder.

## Docker

Standalone image (nginx serving the Vite build). Not the API `Dockerfile` at the repo root.

```bash
cd packages/web
npm run docker:build
npm run docker:run
```

Open [http://localhost:8080](http://localhost:8080).
