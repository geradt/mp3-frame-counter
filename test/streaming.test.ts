import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { countMp3Frames, createStreamingFrameCounter } from "../src/mp3.js";
import { buildFrames, buildFramesWithInfo, buildId3v2, chunked } from "./helpers.js";

/** Stream `data` through the incremental counter in `chunkSize` pieces. */
function streamCount(data: Buffer, chunkSize: number): number {
    const counter = createStreamingFrameCounter();
    for (const chunk of chunked(data, chunkSize)) counter.push(chunk);
    return counter.end();
}

describe("createStreamingFrameCounter", () => {
    // The streamed count must equal the whole-buffer count regardless of how the bytes are split,
    // including awkward sizes that land mid-frame and mid-header.
    const chunkSizes = [1, 3, 7, 64, 417, 418, 1000, 4096];

    it("matches countMp3Frames for every chunk size", () => {
        const data = buildFrames(20);
        const expected = countMp3Frames(data);
        for (const size of chunkSizes) {
            expect(streamCount(data, size)).toBe(expected);
        }
    });

    it("handles an ID3v2 tag split across chunks", () => {
        const data = Buffer.concat([buildId3v2(500), buildFrames(5)]);
        for (const size of [1, 7, 256]) {
            expect(streamCount(data, size)).toBe(5);
        }
    });

    it("excludes the Xing/Info frame when streamed", () => {
        const data = buildFramesWithInfo(8); // first frame is metadata -> 7 audio frames
        expect(countMp3Frames(data)).toBe(7);
        for (const size of [1, 36, 417]) {
            expect(streamCount(data, size)).toBe(7);
        }
    });

    it("returns 0 for an empty stream", () => {
        expect(streamCount(Buffer.alloc(0), 16)).toBe(0);
    });
});

const fixturePath = fileURLToPath(new URL("./fixtures/sample.mp3", import.meta.url));

describe.skipIf(!existsSync(fixturePath))("streaming the real sample", () => {
    it("counts the same as the whole-buffer parser", () => {
        const data = readFileSync(fixturePath);
        const expected = countMp3Frames(data);
        for (const size of [1024, 9973, 65536]) {
            expect(streamCount(data, size)).toBe(expected);
        }
    });
});
