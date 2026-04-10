# CareDrop Agent Guide

## Active App Entry Point
- Frontend entry: `C:\Users\ACER\proj\CareDrop\src\main.jsx`
- Live React shell: `C:\Users\ACER\proj\CareDrop\src\App.jsx`

## Repo Structure
- `src/App.jsx`: active app composition layer
- `src/features/*`: feature UI modules gradually being extracted from `App.jsx`
- `src/hooks/*`: shared React hooks for adaptive insights, persistence, and session behavior
- `src/services/*`: business logic that should stay outside the UI layer
- `src/data/questionBank/*`: seeded question-bank content split by subject plus shared bank constants
- `src/data/*`: other static study data
- `src/caredrop/*`: shared tokens, helpers, layout primitives, and planning utilities
- `api/*`: Vercel-style serverless endpoints
- `server/index.js`: local Express API for development and non-serverless Node hosting
- `supabase/schema.sql`: MVP cloud sync schema
- `archive/App.tsx`: legacy app implementation, not the live entry point

## Commands
- Install: `npm install`
- Frontend + backend dev: `npm run dev`
- Frontend build: `npm run build`
- Preview built frontend: `npm run preview`
- Local backend only: `npm run dev:server`
- Frontend only: `npm run dev:client`
- Tests: `npm run test`

## Deployment Notes
- Current frontend build target is Vite static output.
- Current backend code exists in two forms:
  - `server/index.js` for local/dev or separate Node hosting
  - `api/*` for serverless-style deployment
- Health route to check first:
  - local Express: `/api/health`
  - deployed serverless should expose the same API behavior

## Environment Variables
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for server-side admin user analytics
- `VITE_ADMIN_EMAILS`
- `GITHUB_FEEDBACK_TOKEN`
- `GITHUB_FEEDBACK_REPO`
- Optional frontend API override: `VITE_API_BASE_URL`

## Conventions
- Prefer extracting business logic into `src/services/*` or `src/hooks/*` before editing the main UI shell.
- Prefer reusing tokens from `src/caredrop/theme.js` and helpers from `src/caredrop/*`.
- Keep dashboard logic separate from study-mode logic.
- Preserve current user-facing flows unless a change is explicitly requested.

## Legacy / Caution Areas
- `archive/App.tsx` is legacy. Do not wire it back into `main.jsx`.
- `src/App.jsx` is still large but active; move logic out incrementally rather than rewriting blindly.
- Avoid changing both `server/index.js` and `api/*` behavior inconsistently. If one API contract changes, document or mirror it.
