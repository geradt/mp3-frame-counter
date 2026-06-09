# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A technical-assessment solution: an Express HTTP API that accepts an uploaded MP3 and returns its MPEG audio frame count. The full brief is in `docs/project-guidelines.md` — read it before making changes, because several requirements are hard constraints, not preferences.

**Fixed constraints from the brief (do not break these):**

- **Endpoint contract is exact:** `POST /file-upload`, file sent as the multipart field named `file`, response body `{ "frameCount": <number> }` with a JSON content type. The current code already matches this.
- **Frames must be parsed by hand.** Using an npm package to parse MP3/MPEG frame data is explicitly disallowed. Packages for *other* concerns (HTTP via `express`, uploads via `multer`, generic utils) are fine.
- **Must be TypeScript.**
- **Primary target is MPEG Version 1, Layer III.** Other MPEG versions/layers are out of scope per the brief, though the current tables happen to cover MPEG2/2.5 and Layers I/II as well.

The brief is also scored on tooling (formatting/linting/**testing**) and on a README with run + test instructions — none of which exist yet. These are the natural next pieces of work.

## Commands

No npm scripts are wired up yet (`npm test` is still the placeholder). Run things directly:

- Start the server: `npx tsx src/index.ts` (listens on `http://localhost:3000`)
- Watch/reload during dev: `npx tsx watch src/index.ts`
- Type-check (no emit; `tsconfig` defines no `outDir`): `npx tsc --noEmit`
- Manual end-to-end test against the running server:
  `curl -F file=@/path/to/sample.mp3 http://localhost:3000/file-upload`

When adding real workflows, add matching `dev`/`start`/`test` scripts to `package.json` rather than relying on ad-hoc `npx`.

## Architecture

The entire app is one file, `src/index.ts`, in two layers:

1. **HTTP layer** — `express` + `multer` with `memoryStorage()`, so the upload arrives as an in-memory `Buffer` at `req.file.buffer` (no temp files). The route hands that buffer straight to the parser.

2. **MP3 frame parser** (pure functions, no I/O) — the substance of the exercise:
   - `skipId3v2` — detects a leading `ID3` tag and skips it using the 28-bit synchsafe size in bytes 6–9, returning the offset where audio begins.
   - `frameLengthAt` — validates an MPEG frame header at an offset (11-bit sync word, version/layer/bitrate/sample-rate bits) and computes the frame's byte length from the `BITRATES`/`SAMPLE_RATES` lookup tables. Returns `null` for anything invalid.
   - `confirmedFrameLengthAt` — guards against *false sync* (the byte pattern `0xFFE…` can occur inside audio data) with a **two-frame lookahead**: a header only counts if another valid header parses at the predicted next-frame position. The last frame in the stream has no successor, so a lone valid header at EOF is accepted.
   - `countMp3Frames` — walks the buffer from the post-ID3 offset, advancing by the confirmed frame length on a hit and **resyncing one byte at a time** on a miss, counting confirmed frames.

   Frame-length math distinguishes Layer I (`(12·bitrate/sampleRate + pad)·4`) from Layers II/III (`coefficient·bitrate/sampleRate + pad`, where the coefficient is 144 except 72 for Layer III on MPEG2/2.5).

## TypeScript configuration constraints

`tsconfig.json` is strict and shapes how the byte-parsing code must be written:

- **`noUncheckedIndexedAccess`** — every table/array index is `T | undefined`. This is why the parser reads bytes through the `readByte` helper and checks lookups (`bitrateTable?.[i]`) for `undefined` before use. Keep that discipline when extending it.
- **`module: nodenext` + `verbatimModuleSyntax`** — ESM `import`/`export`, explicit `import type` for type-only imports, and `.js` extensions on relative imports of `.ts` sources. (`package.json` is correctly set to `"type": "module"`.)
- **`exactOptionalPropertyTypes`**, **`isolatedModules`**, **`moduleDetection: force`** — be deliberate about optional-vs-undefined; every file is a module.
