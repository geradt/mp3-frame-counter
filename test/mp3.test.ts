import { describe, it, expect } from "vitest";
import { countMp3Frames, frameLengthAt, isInfoFrame, skipId3v2 } from "../src/mp3.js";
import { buildFrames, buildFramesWithInfo, buildId3v2, FRAME_LENGTH } from "./helpers.js";

describe("frameLengthAt", () => {
    it("computes the length of a valid MPEG1 Layer III frame", () => {
        expect(frameLengthAt(buildFrames(1), 0)).toBe(FRAME_LENGTH);
    });

    it("rejects a position without a sync word", () => {
        expect(frameLengthAt(Buffer.from([0x00, 0x00, 0x00, 0x00]), 0)).toBeNull();
    });

    it("rejects a truncated header at the end of the buffer", () => {
        expect(frameLengthAt(Buffer.from([0xff, 0xfb]), 0)).toBeNull();
    });
});

describe("skipId3v2", () => {
    it("returns 0 when there is no ID3 tag", () => {
        expect(skipId3v2(buildFrames(1))).toBe(0);
    });

    it("skips past an ID3v2 tag using its synchsafe size", () => {
        expect(skipId3v2(buildId3v2(500))).toBe(10 + 500);
    });
});

describe("countMp3Frames", () => {
    it("counts back-to-back frames exactly", () => {
        expect(countMp3Frames(buildFrames(10))).toBe(10);
    });

    it("counts a single frame at end-of-stream (no successor)", () => {
        expect(countMp3Frames(buildFrames(1))).toBe(1);
    });

    it("ignores a leading ID3v2 tag", () => {
        const data = Buffer.concat([buildId3v2(128), buildFrames(5)]);
        expect(countMp3Frames(data)).toBe(5);
    });

    it("returns 0 for an empty buffer", () => {
        expect(countMp3Frames(Buffer.alloc(0))).toBe(0);
    });

    it("returns 0 for non-MP3 data", () => {
        expect(countMp3Frames(Buffer.alloc(2048))).toBe(0);
    });

    it("excludes a leading Xing/Info metadata frame from the count", () => {
        // 5 physical frames, but the first is an Info frame → 4 audio frames.
        expect(isInfoFrame(buildFramesWithInfo(5), 0)).toBe(true);
        expect(countMp3Frames(buildFramesWithInfo(5))).toBe(4);
        expect(countMp3Frames(buildFramesWithInfo(5, "Xing"))).toBe(4);
    });

    it("is not fooled by a single false sync inside audio data", () => {
        // One stray 0xFFE pattern with no valid following frame should not be counted.
        const junk = Buffer.alloc(2048);
        junk[1000] = 0xff;
        junk[1001] = 0xfb;
        expect(countMp3Frames(junk)).toBe(0);
    });
});
