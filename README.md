# mp3-frame-counter

An HTTP API that accepts an MP3 upload and returns the number of MPEG audio frames in the file. The MP3 stream is parsed by hand (no audio-decoding libraries) — frame headers are read directly from the file's bytes.

> Scope: built and verified for **MPEG Version 1, Audio Layer III** files (the near-universal `.mp3` format). Other MPEG versions/layers are out of scope.

## Requirements

- **Node.js 18+** (developed on Node 24)
- npm

## Setup

```bash
npm install
```

## Running

```bash
npm start      # start the server
npm run dev    # start with auto-reload on file changes
```

The server listens on **http://localhost:3000**.

## Usage

Send a `POST` request to `/file-upload` with the MP3 as a multipart form field named `file`.

```bash
curl -F file=@/path/to/song.mp3 http://localhost:3000/file-upload
```

Successful response:

```json
{ "frameCount": 6089 }
```

> The count excludes the encoder's `Xing`/`Info` metadata frame, so it matches what `mediainfo` reports for the same file.

If no file is provided, the endpoint responds with `400`:

```json
{ "error": "No file uploaded. Send an mp3 as the 'file' field." }
```

## Verifying the result

You can cross-check the frame count against a reference tool such as [`mediainfo`](https://mediaarea.net/en/MediaInfo):

```bash
mediainfo --Output='Audio;%FrameCount%' /path/to/song.mp3
```

## How it works

The upload is held in memory as a `Buffer` (via `multer`'s memory storage) and passed to a small hand-written parser in `src/mp3.ts`:

1. Skip a leading `ID3v2` metadata tag, if present, to find where the audio begins.
2. Walk the buffer frame by frame. At each position, validate the 11-bit MPEG sync word plus the version/layer/bitrate/sample-rate header bits, and compute the frame's length from the MPEG bitrate and sample-rate tables.
3. Guard against *false sync* (the sync byte pattern can occur inside audio data) with a two-frame lookahead — a header only counts if another valid header is found at the predicted position of the next frame.
4. Exclude the encoder's `Xing`/`Info` metadata frame, which carries VBR/duration info rather than audio (this is what reference tools like `mediainfo` do).
5. Count the confirmed audio frames and return the total.

## Available scripts

| Script | Description |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run the server with auto-reload |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run typecheck` | Type-check without emitting output |

## Tech stack

- **TypeScript** (run directly via [`tsx`](https://github.com/privatenumber/tsx))
- **Express** — HTTP server
- **Multer** — multipart upload handling
