import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import request from "supertest";
import { countMp3Frames } from "../src/mp3.js";
import { createApp } from "../src/app.js";
import { SAMPLES } from "./samples.js";

// End-to-end checks against real MP3s, each pinned to a count verified with `mediainfo`.
// A sample is skipped (not failed) if its file isn't present.
describe("real MP3 fixtures", () => {
    for (const sample of SAMPLES) {
        describe.skipIf(!existsSync(sample.path))(sample.name, () => {
            const buffer = existsSync(sample.path) ? readFileSync(sample.path) : Buffer.alloc(0);

            it("parses the frame count that mediainfo reports", () => {
                expect(countMp3Frames(buffer)).toBe(sample.expectedFrames);
            });

            it("returns that count over the endpoint", async () => {
                const res = await request(createApp()).post("/file-upload").attach("file", buffer, "sample.mp3");

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ frameCount: sample.expectedFrames });
            });
        });
    }
});
