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

### Errors

| Status | When                                                       |
| ------ | ---------------------------------------------------------- |
| `400`  | No file in the request, or sent under the wrong field name |
| `413`  | File exceeds the size limit (100 MB by default)            |
| `422`  | The upload contains no MP3 audio frames (not a valid MP3)  |
| `500`  | Unexpected failure while processing the file               |

Each error response is JSON of the form `{ "error": "<message>" }`.

## Testing

The repository includes sample MP3s under `test/fixtures/`. With the server running (`npm start`), count the frames in the provided sample — this command runs as-is from the project root:

```bash
curl -F file=@test/fixtures/sample.mp3 http://localhost:3000/file-upload
# => {"frameCount":6089}
```

To run the automated unit and integration test suite (parser, endpoint, streaming, and the real sample files):

```bash
npm test
```

## Verifying the result

You can cross-check the frame count against a reference tool such as [`mediainfo`](https://mediaarea.net/en/MediaInfo):

```bash
mediainfo --Output='Audio;%FrameCount%' /path/to/song.mp3
```

## How it works

The upload is **streamed** through a small hand-written parser in `src/mp3.ts` — the bytes are counted as they arrive rather than buffered whole, so memory stays flat regardless of file size:

1. Skip a leading `ID3v2` metadata tag, if present, to find where the audio begins.
2. Walk the stream frame by frame. At each position, validate the 11-bit MPEG sync word and require the header to be MPEG Version 1, Layer III (other versions/layers are out of scope and don't validate), then compute the frame's length from its bitrate and sample rate.
3. Guard against _false sync_ (the sync byte pattern can occur inside audio data) with a two-frame lookahead — a header only counts if another valid header is found at the predicted position of the next frame.
4. Exclude the encoder's `Xing`/`Info` metadata frame, which carries VBR/duration info rather than audio (this is what reference tools like `mediainfo` do).
5. Count the confirmed audio frames and return the total.

### Scalability

The upload is consumed as a stream (a custom `multer` storage engine feeds each chunk straight into the parser), so only a small window — at most one frame straddling a chunk boundary — is ever held in memory; a 5 GB file costs about the same as a 5 MB one. Uploads are also capped (`100 MB` by default) so a single oversized or malicious request is rejected early with `413` rather than tying up the server. At much larger scale you'd accept a direct upload to object storage and count frames in a background worker, but that is out of scope here.

## Available scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `npm start`          | Run the server                     |
| `npm run dev`        | Run the server with auto-reload    |
| `npm test`           | Run the test suite once            |
| `npm run test:watch` | Run the tests in watch mode        |
| `npm run typecheck`  | Type-check without emitting output |
| `npm run lint`       | Run ESLint                         |
| `npm run format`     | Format the codebase with Prettier  |

## Tech stack

- **TypeScript** (run directly via [`tsx`](https://github.com/privatenumber/tsx))
- **Express** — HTTP server
- **Multer** — multipart upload handling
