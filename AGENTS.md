# wellfind-api: agent guide

Backend and database for Wellfind Academic. Payload 3.92 on Next.js 16, PostgreSQL, TypeScript, pnpm. Consumed by `../wellfind-crm`, `../wellfind-app`, `../wellfind-client`.

Workspace map: `../AGENTS.md`. Find files: Grep `../docs/index/api.md`; by feature: `../docs/FEATURE_MAP.md`.

Before any feature, fix or issue: check saved audits in `../docs/audits/` (steps: "Audits" in `../AGENTS.md`).

## Danger

- `.env` points to a **remote database**. Ask before `pnpm dev` (Payload may push schema changes), `pnpm migrate`, `seed:*` or anything in `scripts/` (some delete data).
- Never read or commit `.env*` (except `*.example`), `backups/`, `teacher-documents/`, `user-files/`.

## Layout

`src/app/api/**/route.ts` (thin) -> `src/services/` (logic) -> `src/collections/` (schema, access, hooks). Shared: `src/lib/`. Config: `src/payload.config.ts`, CORS in `src/proxy.ts`.

## Conventions

- Guard every route (`requireActiveUser`, `requireSuperAdmin`, `requireTeacher`); respond with `apiSuccess` / `apiError` / `handleRouteError` from `@/lib/api`. Services throw `ServiceError`.
- Copy the nearest existing route and service of the same area.
- New admin path -> add it to `moduleForPath` in `src/lib/permissions.ts`.
- Schema change: edit collection -> `pnpm generate:types` -> `pnpm migrate:create` -> review. Applying needs owner approval.
- Never edit `payload-types.ts`, `payload-generated-schema.ts` or migration JSON; never read them whole.
- Changed request or response -> update `API-DOC/<topic>.md` and every caller.

## Commands

```bash
pnpm dev -p 3004                # clients expect port 3004 (remote DB, see Danger)
npx tsc --noEmit                # type check
npx vitest run --config ./vitest.config.mts tests/int/<file>.int.spec.ts
pnpm test:int                   # all; needs local test Postgres and .env.test
```

Tests only accept a local database ending in `_test` (`.env.test.example`). Lint is currently broken (`../docs/KNOWN_ISSUES.md` K-4).

## Working rules

Smallest complete change; no unrelated refactors or new dependencies; run the smallest relevant check and report honestly. Then follow "definition of done" in `../AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
