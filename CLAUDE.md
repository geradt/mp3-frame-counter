# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a freshly scaffolded project — only configuration exists so far (no `src/`, no entry point, no tests). The name (`mp3-frame-counter`) plus the installed dependencies (`express` 5, `multer` 2) indicate the intent: an Express HTTP server that accepts an uploaded MP3 via `multer` and counts its MPEG audio frames. When adding the first code, you are establishing conventions, not following existing ones.

## Commands

No build/start/test scripts are defined yet (`npm test` is still the placeholder). Use the installed binaries directly:

- Run TypeScript without compiling: `npx tsx <file.ts>` (e.g. `npx tsx src/index.ts`)
- Watch mode: `npx tsx watch src/index.ts`
- Type-check only (no emit; `tsconfig` has no `outDir` set): `npx tsc --noEmit`

When you add an entry point, wire up matching `dev`/`start` scripts in `package.json` rather than relying on ad-hoc `npx` invocations.

## TypeScript configuration constraints

`tsconfig.json` is unusually strict — code must satisfy these or it won't type-check:

- **`module: nodenext` + `verbatimModuleSyntax`** — use ESM `import`/`export` syntax, include file extensions in relative imports (`./foo.js` even for `.ts` sources), and use `import type` for type-only imports.
- **`noUncheckedIndexedAccess`** — every array/record index access is `T | undefined`; guard before use. This matters heavily for byte-level MP3 frame parsing (`buffer[i]` is possibly `undefined`).
- **`exactOptionalPropertyTypes`** — `{ x?: T }` is not assignable from `{ x: undefined }`; be deliberate about optional vs. explicitly-undefined.
- **`isolatedModules` + `moduleDetection: force`** — every file is a module; no global-script files or `const enum`.

Note: `package.json` sets `"type": "commonjs"` while `tsconfig` uses `nodenext`. Reconcile these when adding real code (typically switch `package.json` to `"type": "module"`).
