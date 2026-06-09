import express from "express";
import multer from "multer";
import { countMp3Frames } from "./mp3.js";

const upload = multer({ storage: multer.memoryStorage() }); // keep file in memory as a Buffer

/** Build the Express app. Kept separate from server startup so it can be imported in tests. */
export function createApp() {
    const app = express();

    app.post("/file-upload", upload.single("file"), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Send an mp3 as the 'file' field." });
        }

        const frameCount = countMp3Frames(req.file.buffer);
        res.json({ frameCount });
    });

    return app;
}
