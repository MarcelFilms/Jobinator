# Jobinator

Private dashboard for one owner. Milestone 1 discovers real remote customer-support vacancies, filters them in ordinary code, and stores rules-based Candidate Fit and OE scores. It does not call a model, generate an application, or insert sample jobs.

## Sources

1. We Work Remotely customer-support RSS: `https://weworkremotely.com/categories/remote-customer-support-jobs.rss`
2. Jobicy: `GET https://jobicy.com/api/jobs?geo=uk&industry=supporting`

Reed is not connected. UK eligibility is decided from the listing text, not from a board filter alone. Each row keeps the source name and the source URL.

Jobicy is not synced again within an hour of a successful sync. A failed source keeps yesterday’s rows and records the error.

## Setup

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (secret key, server only)
- `CRON_SECRET`
- `OWNER_EMAIL`

Apply `supabase/migrations/0001_milestone1.sql` in the Supabase SQL editor, or run `npm run apply-schema` with `SUPABASE_ACCESS_TOKEN` or `DATABASE_URL` set. The secret key alone cannot run DDL.

```bash
npm install
npm test
npm run prove
npm run dev
```

`npm run prove` fetches both live feeds and scores them. It does not need Supabase. It exits non-zero if a fetch fails or a feed parses to zero listings.

Sign in with `OWNER_EMAIL`. The first successful password creates that auth user and seeds the profile and writing rules. No other email can sign in.

## Discovery

`POST /api/cron/discover` with `Authorization: Bearer $CRON_SECRET`. The same handler accepts GET so a host cron that cannot POST still works. The overview has a Run discovery button for the signed-in owner.

Today’s usage row is in Europe/London. With the model off, spend is £0.00.
