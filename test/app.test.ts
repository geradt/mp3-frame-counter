import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { buildFrames } from "./helpers.js";

const app = createApp();

describe("POST /file-upload", () => {
    it("returns the frame count for an uploaded MP3", async () => {
        const res = await request(app).post("/file-upload").attach("file", buildFrames(7), "sample.mp3");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        expect(res.body).toEqual({ frameCount: 7 });
    });

    it("returns 400 when no file is provided", async () => {
        const res = await request(app).post("/file-upload");

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
    });
});
