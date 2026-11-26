# Notes for AI assistants working in this repo

- The user writes Egyptian Arabic; reply in the same language, simply.
- 3D villa showcase (public/showcase, Revit button, Supabase showcase cloud): read
  `docs/SHOWCASE-HANDOFF.md` first. Office portal history: `docs/CODEX-HANDOFF-20261118.md`.
- Never commit villa data (`public/showcase/data/*` except `sample-villa.js`): the repo is public.
- Never push or merge to `main` without the user's explicit OK.
- Never write, copy or show secret keys; the user puts secrets in `.env` themselves.
- Before committing: `node scripts/update-manifest.mjs` then `npm run check` (all PASS).
