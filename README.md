# Jobinator

Private dashboard for one owner. Milestone 1 discovers real remote customer-support vacancies, filters them in ordinary code, and stores rules-based Candidate Fit and OE scores. It does not call a model, generate an application, or insert sample jobs.

## Sources

1. We Work Remotely customer-support RSS: `https://weworkremotely.com/categories/remote-customer-support-jobs.rss`
2. Jobicy: `GET https://jobicy.com/api/jobs?geo=uk&industry=supporting` and `industry=technical-support`, at most once an hour
3. Working Nomads: `GET https://www.workingnomads.com/api/exposed_jobs/` (support titles and customer categories only)
4. Remotive: `GET https://remotive.com/api/remote-jobs`, keeping rows whose category is customer service or customer support, and linking back to the Remotive URL
5. Public company boards: Greenhouse, Lever, and Ashby, for a fixed list of companies, support titles only
6. Reed’s public RSS, LinkedIn’s public guest job pages, Arbeitnow, and Remote OK
7. One public search page each for Indeed UK, CV-Library, Totaljobs, Adzuna, and Glassdoor. A login wall, a CAPTCHA, or HTTP 403 stops that source. The app does not log in and does not try to get around the block.

UK eligibility is decided from the listing text. Reed rows are stored as United Kingdom because they come from the UK site. Each row keeps the source name and the source URL.

Discovery is scheduled at 07:00, 13:00, and 19:00 UTC. Automatic email sending stays off until Gmail is connected, and a web form is never submitted by the app. The daily application cap defaults to 15.

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

The dashboard opens without a sign-in. Server writes use the service role for the single owner in `OWNER_EMAIL`.

## Discovery

`POST /api/cron/discover` with `Authorization: Bearer $CRON_SECRET`. The same handler accepts GET so a host cron that cannot POST still works. The overview has a Run discovery button.

Today’s usage row is in Europe/London. With the model off, spend is £0.00.

## Tailored CVs

Each application gets its own PDF CV, built from the approved base CV for the job's category and the profile facts. The tailor picks, reorders, and rewords the owner's own bullets, skills, and summary to match the job's keywords. Rewording is limited to fixed verb swaps (for example "helped" to "supported") and a few manner words such as "promptly".

The validator checks every tailored CV before it is stored. Bullets and summary lines must match one of the owner's own sentences once those swaps are allowed for. Job headers, dates, education lines, skills, and contact details must match the base CV exactly. Lines that break a writing rule are removed: town, county, LinkedIn, Telegram, user counts, AI tools, overemployment, an unnamed software business, or a qualification the profile lists as absent. A CV that loses a line is stored as needs review, and automatic sending will not use it.

Use **Tailor CVs for shortlisted jobs** on the Queue page, or draft one job at a time. Run `supabase/migrations/0004_tailored_cvs.sql` once first. The default path is rules-based and costs £0. Optional model rewording runs only when AI is on, both spending caps are above 0, a model, provider, and price are set, and `AI_API_KEY` exists on the server. Its output passes through the same validator line by line.
