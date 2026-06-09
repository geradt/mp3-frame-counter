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
        file.stream.on("data", (chunk: Buffer) => counter.push(chunk));
        file.stream.on("end", () => cb(null, { frameCount: counter.end() }));
        file.stream.on("error", cb);
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
            if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ error: `File exceeds the ${maxFileSize}-byte limit.` });
            }
            if (err) {
                return res.status(400).json({ error: "Upload failed." });
            }
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded. Send an mp3 as the 'file' field." });
            }
            res.json({ frameCount: req.file.frameCount });
        });
    });

    return app;
}
