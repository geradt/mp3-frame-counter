import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildFrames } from "./helpers.js";

// Force the parser to throw mid-stream. This exercises two things at once: the storage engine
// must catch the error (rather than let it escape as an uncaughtException and crash the server),
// and the route must report it as a 500.
vi.mock("../src/mp3.js", () => ({
    createStreamingFrameCounter: () => ({
        push(): void {
            throw new Error("frame counting failed");
        },
        end: (): number => 0,
    }),
}));

describe("POST /file-upload server errors", () => {
    it("returns 500 when frame counting throws", async () => {
        const res = await request(createApp()).post("/file-upload").attach("file", buildFrames(1), "sample.mp3");

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty("error");
    });
});
