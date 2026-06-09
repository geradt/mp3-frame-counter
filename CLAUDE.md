# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A technical-assessment solution: an Express HTTP API that accepts an uploaded MP3 and returns its MPEG audio frame count. The full brief is in `docs/project-guidelines.md` — read it before making changes, because several requirements are hard constraints, not preferences.

**Fixed constraints from the brief (do not break these):**

- **Endpoint contract is exact:** `POST /file-upload`, file sent as the multipart field named `file`, response body `{ "frameCount": <number> }` with a JSON content type. The current code already matches this.
- **Frames must be parsed by hand.** Using an npm package to parse MP3/MPEG frame data is explicitly disallowed. Packages for _other_ concerns (HTTP via `express`, uploads via `multer`, generic utils) are fine.
- **Must be TypeScript.**
- **Primary target is MPEG Version 1, Layer III.** Other MPEG versions/layers are out of scope per the brief, though the current tables happen to cover MPEG2/2.5 and Layers I/II as well.

The brief is also scored on tooling (formatting/linting/**testing**) and on a README with run + test instructions — all of which are now in place (Prettier, ESLint, Vitest, README).

## Commands

- `npm start` — run the server (listens on `http://localhost:3000`)
- `npm run dev` — run with auto-reload
- `npm test` — run the Vitest suite once (`npm run test:watch` for watch mode)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- Run a single test file: `npx vitest run test/mp3.test.ts`
- Manual end-to-end check against a running server: `curl -F file=@/path/to/sample.mp3 http://localhost:3000/file-upload`

## Architecture

Three source files, separated so the app is importable in tests:

- **`src/index.ts`** — bootstrap only; calls `createApp().listen(3000)`.
- **`src/app.ts`** — `createApp()` builds the Express app (with `multer` `memoryStorage()`, so the upload arrives as an in-memory `Buffer` at `req.file.buffer`) and is exported without listening, so tests can drive it via `supertest`. The `POST /file-upload` route hands the buffer to the parser.
- **`src/mp3.ts`** — the hand-written parser (pure functions, no I/O) — the substance of the exercise:
    - `skipId3v2` — detects a leading `ID3` tag and skips it using the 28-bit synchsafe size in bytes 6–9, returning the offset where audio begins.
    - `frameLengthAt` — validates an MPEG frame header at an offset (11-bit sync word, version/layer/bitrate/sample-rate bits) and computes the frame's byte length from the `BITRATES`/`SAMPLE_RATES` lookup tables. Returns `null` for anything invalid.
    - `confirmedFrameLengthAt` — guards against _false sync_ (the byte pattern `0xFFE…` can occur inside audio data) with a **two-frame lookahead**: a header only counts if another valid header parses at the predicted next-frame position. The last frame in the stream has no successor, so a lone valid header at EOF is accepted.
    - `isInfoFrame` — detects the `Xing`/`Info` metadata frame (located after the version/channel-dependent side-info block). This frame is excluded from the count so the result matches `mediainfo` and the encoder's own count.
    - `countMp3Frames` — walks the buffer from the post-ID3 offset, advancing by the confirmed frame length on a hit and **resyncing one byte at a time** on a miss, counting confirmed frames but skipping the Info frame.

    Frame-length math distinguishes Layer I (`(12·bitrate/sampleRate + pad)·4`) from Layers II/III (`coefficient·bitrate/sampleRate + pad`, where the coefficient is 144 except 72 for Layer III on MPEG2/2.5).

## Tests

Vitest, under `test/`. `helpers.ts` builds synthetic MPEG1 Layer III frames with known counts so assertions are deterministic. `mp3.test.ts` covers the parser, `app.test.ts` covers the HTTP endpoint via `supertest`, and `fixture.test.ts` runs against the real `test/fixtures/sample.mp3` (pinned to 6089 frames, verified with `mediainfo`).

## TypeScript configuration constraints

`tsconfig.json` is strict and shapes how the byte-parsing code must be written:

- **`noUncheckedIndexedAccess`** — every table/array index is `T | undefined`. This is why the parser reads bytes through the `readByte` helper and checks lookups (`bitrateTable?.[i]`) for `undefined` before use. Keep that discipline when extending it.
- **`module: nodenext` + `verbatimModuleSyntax`** — ESM `import`/`export`, explicit `import type` for type-only imports, and `.js` extensions on relative imports of `.ts` sources. (`package.json` is correctly set to `"type": "module"`.)
- **`exactOptionalPropertyTypes`**, **`isolatedModules`**, **`moduleDetection: force`** — be deliberate about optional-vs-undefined; every file is a module.
