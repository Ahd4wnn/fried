# Hovio frontend (hovio.org)

React + Vite + TypeScript (strict) app. Tailwind for styling, TanStack Query for
server state, React Router for routing, Supabase client for auth/data. Design
tokens live in `tailwind.config.ts` (see `../docs/design-system.md`).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_* values
npm run dev                  # http://localhost:5173
```

## Scripts

| Script              | Does                         |
| ------------------- | ---------------------------- |
| `npm run dev`       | Start the Vite dev server    |
| `npm run build`     | Typecheck + production build |
| `npm run typecheck` | TypeScript only (`tsc -b`)   |
| `npm run lint`      | ESLint                       |
| `npm run format`    | Prettier write               |

This is the app shell only (Prompt 1). The UI kit and features arrive in later
prompts — see `../docs/build-sequence.md`.
