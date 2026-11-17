# Efficient Agent Execution Rules

## Objective

Complete development tasks with minimum unnecessary work while maintaining correctness, security, and code quality.

## 1. Understand Before Acting

- Identify the exact requirement and expected outcome.
- Inspect only the files and dependencies relevant to the task.
- Reuse existing conversation context, repository knowledge, and previous findings.
- Do not rediscover information already established unless verification is necessary.

## 2. Minimal Changes

- Make the smallest complete and correct change.
- Do not refactor unrelated code, rename unrelated variables, or modify unrelated files.
- Preserve existing architecture, conventions, and behavior outside the requested scope.
- Do not introduce new dependencies unless required.

## 3. No Repeated Work

- Do not repeatedly read, search, analyze, or edit the same code without a concrete reason.
- Reuse previous command results and inspection findings when still valid.
- Avoid repeating failed commands without changing the underlying approach.
- Do not create multiple alternative implementations when one suitable solution is clear.

## 4. Efficient Verification

- Run the smallest relevant verification first.
- Do not run full builds, repository-wide linting, or complete test suites for trivial changes unless necessary.
- Never skip verification when correctness or risk requires it.
- Never claim a check passed unless it actually ran and succeeded.

## 5. Tool and Terminal Discipline

- Avoid unnecessary terminal commands, directory listings, dependency installation, and repository-wide scans.
- Do not run long-running commands when a targeted check is sufficient.
- Do not wait for unrelated background processes.
- Use parallel operations only when independent and safe.

## 6. Clear Completion Criteria

- Stop when the requested change is complete and adequately verified.
- Do not continue exploring unrelated improvements.
- Report modified files, verification performed, and any unresolved issues concisely.

## Priority

Correctness and security first, minimal scope second, execution speed third. Never sacrifice required verification merely to finish faster.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
