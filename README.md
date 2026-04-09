# CareDrop

PRC NLE-focused study platform with Gemini-powered summaries, flashcards, quizzes, supportive dashboard guidance, compact feedback reporting, and optional Supabase-based cloud sync for learner progress.

## Setup

1. Copy `.env.example` to `.env`
2. Add your Gemini API key
3. Optional for cloud sync and sign-in: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Optional for central request inbox: add a GitHub token plus `GITHUB_FEEDBACK_REPO`
5. Run `npm install`
6. Run `npm run dev`

## Development Commands

- `npm run dev`: starts Vite frontend and local Express backend together
- `npm run dev:client`: runs the Vite frontend only
- `npm run dev:server`: runs the Express backend only
- `npm run build`: builds the frontend bundle
- `npm run preview`: previews the built frontend bundle
- `npm run test`: runs the current Vitest suite

## Deployment Architecture

CareDrop currently has a split architecture:

- Frontend:
  - Vite React app
  - built by `vite build`
  - static assets can run on Vercel or another static host
- Backend:
  - local/dev Node server at [C:\Users\ACER\proj\CareDrop\server\index.js](C:\Users\ACER\proj\CareDrop\server\index.js)
  - serverless-style handlers in [C:\Users\ACER\proj\CareDrop\api](C:\Users\ACER\proj\CareDrop\api)

You should choose and document one production path clearly:

- Option A: deploy frontend and Express backend separately
- Option B: rely on the `api/*` serverless handlers and keep the frontend static

### Health Check

- API health route: `/api/health`

### Required Environment Variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_EMAILS`
- `GITHUB_FEEDBACK_TOKEN`
- `GITHUB_FEEDBACK_REPO`
- optional: `VITE_API_BASE_URL`

## Features

- Subject and topic-focused study sessions
- 1000+ balanced internal review-bank items powering flashcards and quiz prompts
- Local flashcards and quiz flow with cloud-ready continuity
- Gemini summaries, flashcards, and quizzes with PRC NLE, DOH-aware, and PNDF-aware framing
- Polished sign-in/register flow with Supabase-ready cloud sync
- Saved review sessions
- Non-repeating AI sessions unless notes are provided
- Central request/report inbox through GitHub Issues when configured

## Testing Focus

Current first-pass automated coverage targets:

- adaptive recommendation engine output
- persistence coercion / mode safety
- auth session expiry restore behavior
- remediation source selection

## Free Cloud Sync Setup

CareDrop can use Supabase's free tier for sign-in and progress sync.

1. Create a free Supabase project.
2. In Supabase Authentication, enable Email/Password sign-in.
3. Copy the project URL and anon key into:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Run the SQL in [C:\Users\ACER\proj\CareDrop\supabase\schema.sql](C:\Users\ACER\proj\CareDrop\supabase\schema.sql)
5. Redeploy the app.

If Supabase keys are not configured, the app falls back to device-local accounts and storage.

## Structured Data Roadmap

The current MVP still persists most synced learner state in `public.user_progress.payload`, but the repo now also includes a structured migration path in [C:\Users\ACER\proj\CareDrop\supabase\structured_progress.sql](C:\Users\ACER\proj\CareDrop\supabase\structured_progress.sql) for:

- `review_sessions`
- `review_attempts`
- `card_ratings`
- `planner_items`
- `calendar_events`
- `recommendation_snapshots`
