import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { countMp3Frames } from "../src/mp3.js";
import { createApp } from "../src/app.js";

// Real-world end-to-end check against the provided sample. Skipped until the file is dropped in.
// Once you know the true count (e.g. from `mediainfo`), set EXPECTED_FRAME_COUNT to pin it exactly.
const fixturePath = fileURLToPath(new URL("./fixtures/sample.mp3", import.meta.url));
// Verified against `mediainfo --Output='Audio;%FrameCount%' sample.mp3` (6089 audio frames;
// the Xing/Info metadata frame is excluded, matching mediainfo and the encoder's own count).
const EXPECTED_FRAME_COUNT: number | null = 6089;

describe.skipIf(!existsSync(fixturePath))("sample.mp3 fixture", () => {
    const buffer = existsSync(fixturePath) ? readFileSync(fixturePath) : Buffer.alloc(0);

    it("parses a positive number of frames", () => {
        expect(countMp3Frames(buffer)).toBeGreaterThan(0);
    });

    it.skipIf(EXPECTED_FRAME_COUNT === null)("matches the known frame count", () => {
        expect(countMp3Frames(buffer)).toBe(EXPECTED_FRAME_COUNT);
    });

    it("the endpoint returns the same count as the parser", async () => {
        const res = await request(createApp()).post("/file-upload").attach("file", buffer, "sample.mp3");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ frameCount: countMp3Frames(buffer) });
    });
});
