import { fileURLToPath } from "node:url";

export interface Sample {
    name: string;
    path: string;
    /** Frame count verified with: mediainfo --Output='Audio;%FrameCount%' <file> */
    expectedFrames: number;
}

function fixturePath(file: string): string {
    return fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));
}

// Real-world MP3s covering different encodings so correctness isn't proven against a single file.
export const SAMPLES: Sample[] = [
    { name: "sample.mp3 (VBR, 44.1 kHz)", path: fixturePath("sample.mp3"), expectedFrames: 6089 },
    { name: "sample2.mp3 (CBR 128k, 48 kHz)", path: fixturePath("sample2.mp3"), expectedFrames: 14787 },
];
