# Repository Guidelines

## Project Structure & Module Organization
- `client/`: React + Vite frontend. Core app code is in `client/src/` with feature pages in `client/src/pages/`, shared UI primitives in `client/src/components/ui/`, and app-specific components in `client/src/components/`.
- `server/`: Express + WebSocket backend (`index.ts`, `routes.ts`, `storage.ts`).
- `shared/`: Cross-runtime TypeScript types and DB schema (`shared/schema.ts`).
- `dist/`: Production build output (`dist/index.js`, `dist/public/`). Treat as generated artifacts.

## Build, Test, and Development Commands
- `npm run dev`: Start the TypeScript server in development mode (serves API + Vite frontend).
- `npm run build`: Build frontend with Vite and bundle backend with esbuild.
- `npm run start`: Run the production bundle from `dist/`.
- `npm run check`: Run TypeScript type-checking (`tsc`) across client, server, and shared code.
- `npm run db:push`: Push Drizzle schema changes to the configured PostgreSQL database.

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode), React function components, ES modules.
- Formatting in existing code uses 2-space indentation, semicolons, and double quotes.
- Naming:
  - Components: PascalCase (`MessageBubble.tsx` style).
  - Hooks: `use-*.ts(x)` naming (`use-websocket.ts`).
  - Routes/pages: lowercase kebab or concise names (`pages/chat.tsx`).
- Prefer path aliases where appropriate: `@/*` for client code, `@shared/*` for shared modules.

## Testing Guidelines
- No dedicated unit test framework is currently configured.
- Minimum gate before PR: `npm run check` must pass.
- For behavior changes, include manual verification notes (e.g., open two tabs, verify live typing, room isolation, reconnect handling).
- If adding tests, keep them adjacent to code (`*.test.ts`) and avoid introducing heavy tooling without team agreement.

## Commit & Pull Request Guidelines
- Commit history is mixed; prefer short, imperative subjects (for example, `Improve room rate limiting`).
- Keep commits focused to one concern and include context in the body for non-trivial changes.
- PRs should include:
  - What changed and why.
  - Linked issue/task (if available).
  - Verification steps (`npm run check`, manual chat/WebSocket checks).
  - Screenshots or short recordings for UI changes.

## Security & Configuration Tips
- Required env for DB workflows: `DATABASE_URL`.
- Server runs on `PORT` (defaults to `8000`).
- Do not commit secrets or local `.env` values; use environment configuration per deployment target.
