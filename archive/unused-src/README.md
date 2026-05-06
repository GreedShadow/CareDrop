This folder contains source files that are not part of the live CareDrop app entry path.

Archived on 2026-05-07 after confirming:
- `src/main.jsx` only mounts `src/App.jsx`
- the live app has no imports referencing these files
- `npm run test` and `npm run build` still pass after removal from `src/`

Archived items:
- `MagicBento.jsx`
- legacy `src/components/ui/*` primitives that are not used by the current app shell
- `src/lib/utils.js`, which existed only for the archived UI primitives
