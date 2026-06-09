import express from "express";
import multer from "multer";
import type { StorageEngine } from "multer";
import { createStreamingFrameCounter } from "./mp3.js";

// Reject oversized uploads outright so a single huge (or malicious) request can't tie up the
// server. At genuinely large scale you'd instead accept a direct upload to object storage and
// count frames in a background worker, but that is out of scope here.
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// Augment the upload's metadata with the streamed frame count (see the storage engine below).
declare global {
    namespace Express {
        namespace Multer {
            interface File {
                frameCount: number;
            }
        }
    }
}

// Custom multer storage: stream the upload straight through the frame counter instead of buffering
// the whole file in memory. Only a small leftover window is ever held, regardless of file size.
const frameCountStorage: StorageEngine = {
    _handleFile(_req, file, cb) {
        const counter = createStreamingFrameCounter();
        let done = false;
        // Report success or failure exactly once. Parsing runs synchronously inside these stream
        // listeners, so a thrown error must be caught here — otherwise it escapes as an
        // uncaughtException and crashes the server instead of failing this one request.
        const finish = (err: Error | null, info?: { frameCount: number }) => {
            if (done) return;
            done = true;
            cb(err, info);
        };
        file.stream.on("data", (chunk: Buffer) => {
            try {
                counter.push(chunk);
            } catch (err) {
                finish(err as Error);
            }
        });
        file.stream.on("end", () => {
            try {
                finish(null, { frameCount: counter.end() });
            } catch (err) {
                finish(err as Error);
            }
        });
        file.stream.on("error", (err: Error) => finish(err));
    },
    _removeFile(_req, _file, cb) {
        cb(null); // nothing on disk to clean up
    },
};

export interface AppOptions {
    maxFileSize?: number;
}

/** Build the Express app. Kept separate from server startup so it can be imported in tests. */
export function createApp(options: AppOptions = {}) {
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const upload = multer({ storage: frameCountStorage, limits: { fileSize: maxFileSize } });
    const app = express();

    app.post("/file-upload", (req, res) => {
        upload.single("file")(req, res, (err: unknown) => {
            // Multer errors are caused by the client's request (too large, wrong field, ...).
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({ error: `File exceeds the ${maxFileSize}-byte limit.` });
                }
                if (err.code === "LIMIT_UNEXPECTED_FILE") {
                    return res.status(400).json({ error: "Send a single file in the 'file' field." });
                }
                return res.status(400).json({ error: `Upload rejected (${err.code}).` });
            }
            // Anything else is a server-side failure (e.g. the parser or stream errored).
            if (err) {
                return res.status(500).json({ error: "Failed to process the uploaded file." });
            }
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded. Send an mp3 as the 'file' field." });
            }
            // No valid MPEG frames means the upload isn't an MP3 (the field is client-supplied and
            // unreliable, so we validate by content rather than by declared type/extension).
            if (req.file.frameCount === 0) {
                return res.status(422).json({ error: "No MP3 audio frames found; the file is not a valid MP3." });
            }
            res.json({ frameCount: req.file.frameCount });
        });
    });

    // Safety net: turn any unhandled error into a JSON 500 rather than an HTML stack trace.
    app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: "Internal server error." });
    });

    return app;
}
