# CareDrop

PRC NLE-focused nursing study workspace with Gemini-powered summaries, flashcards, quizzes, compact feedback reporting, and optional Supabase-based cloud sync for learner progress.

## Setup

1. Copy `.env.example` to `.env`
2. Add your Gemini API key
3. Optional for cloud sync and sign-in: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Optional for central request inbox: add a GitHub token plus `GITHUB_FEEDBACK_REPO`
5. Run `npm install`
6. Run `npm run dev`

## Features

- Subject and topic-focused study sessions
- Local flashcards and quiz flow
- Gemini summaries, flashcards, and quizzes with PRC NLE, DOH-aware, and PNDF-aware framing
- Local sign-in/register with Supabase-ready cloud sync
- Saved review sessions
- Non-repeating AI sessions unless notes are provided
- Central request/report inbox through GitHub Issues when configured

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
