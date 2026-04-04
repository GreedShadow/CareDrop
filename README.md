# CareDrop

PRC NLE-focused nursing study workspace with local study tools plus Gemini-powered summaries, flashcards, and quizzes framed for Philippine nursing review.

## Setup

1. Copy `.env.example` to `.env`
2. Add your Gemini API key
3. Optional for central request inbox: add a GitHub token plus `GITHUB_FEEDBACK_REPO`
4. Run `npm install`
5. Run `npm run dev`

## Features

- Subject and topic-focused study sessions
- Local flashcards and quiz flow
- Gemini summaries, flashcards, and quizzes with PRC NLE, DOH-aware, and PNDF-aware framing
- Saved review sessions
- Non-repeating AI sessions unless notes are provided
- Central request/report inbox through GitHub Issues when configured
