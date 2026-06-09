// Builds synthetic MPEG audio data with a known, exact frame count for deterministic tests.

// A valid MPEG1 Layer III header for 128 kbps @ 44.1 kHz, no padding:
//   byte1 = 0xFF                      (sync)
//   byte2 = 0xFB  (1111 1011)         sync + version=MPEG1 + layer=III + no CRC
//   byte3 = 0x90  (1001 0000)         bitrateIndex=9 (128k) + sampleRateIndex=0 (44.1k) + pad=0
//   byte4 = 0x00                      channel mode etc. (not used for frame length)
// Frame length = floor(144 * 128000 / 44100) = 417 bytes.
const HEADER = [0xff, 0xfb, 0x90, 0x00];
export const FRAME_LENGTH = 417;

/** Build a buffer of `count` valid, back-to-back MPEG1 Layer III frames. */
export function buildFrames(count: number): Buffer {
    const buf = Buffer.alloc(count * FRAME_LENGTH); // padding bytes left as 0x00
    for (let i = 0; i < count; i++) {
        const start = i * FRAME_LENGTH;
        buf[start] = HEADER[0]!;
        buf[start + 1] = HEADER[1]!;
        buf[start + 2] = HEADER[2]!;
        buf[start + 3] = HEADER[3]!;
    }
    return buf;
}

/**
 * Build `count` frames where the first frame is a Xing/Info metadata frame.
 * The header above is MPEG1 + stereo, so the tag sits at byte 4 + 32 = 36 of the frame.
 */
export function buildFramesWithInfo(count: number, tag: "Xing" | "Info" = "Info"): Buffer {
    const buf = buildFrames(count);
    buf.write(tag, 36, "latin1");
    return buf;
}

/** Split a buffer into fixed-size chunks, to simulate a streamed upload. */
export function chunked(buf: Buffer, size: number): Buffer[] {
    const chunks: Buffer[] = [];
    for (let i = 0; i < buf.length; i += size) {
        chunks.push(buf.subarray(i, i + size));
    }
    return chunks;
}

/** Build a minimal ID3v2 tag of `payloadSize` bytes (header is an extra 10 bytes). */
export function buildId3v2(payloadSize: number): Buffer {
    const tag = Buffer.alloc(10 + payloadSize);
    tag.write("ID3", 0, "latin1");
    tag[3] = 0x03; // version major
    tag[4] = 0x00; // version minor
    tag[5] = 0x00; // flags
    // size is a 28-bit synchsafe integer (7 bits per byte) in bytes 6-9
    tag[6] = (payloadSize >> 21) & 0x7f;
    tag[7] = (payloadSize >> 14) & 0x7f;
    tag[8] = (payloadSize >> 7) & 0x7f;
    tag[9] = payloadSize & 0x7f;
    return tag;
}
