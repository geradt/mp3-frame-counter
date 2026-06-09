// MPEG audio frame parsing — hand-written, no decoding libraries.
// Scope: MPEG Version 1 Audio Layer III (the tables also cover MPEG2/2.5 and Layers I/II).

// Bitrate tables (kbps). Index 0 = "free", index 15 = invalid.
// [MPEG version][layer][bitrateIndex]
const BITRATES: Record<string, number[]> = {
    "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // MPEG1 Layer I
    "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // MPEG1 Layer II
    "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG1 Layer III
    "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // MPEG2/2.5 Layer I
    "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG2/2.5 Layer II/III
    "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

// Sample rates (Hz) by MPEG version
const SAMPLE_RATES: Record<number, number[]> = {
    3: [44100, 48000, 32000], // MPEG1
    2: [22050, 24000, 16000], // MPEG2
    0: [11025, 12000, 8000], // MPEG2.5
};

function readByte(buf: Buffer, offset: number): number | null {
    if (offset < 0 || offset >= buf.length) {
        return null;
    }
    return buf.readUInt8(offset);
}

/** Skip an ID3v2 tag if present at the start of the buffer. Returns the new offset. */
export function skipId3v2(buf: Buffer): number {
    if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") {
        const b6 = readByte(buf, 6);
        const b7 = readByte(buf, 7);
        const b8 = readByte(buf, 8);
        const b9 = readByte(buf, 9);
        if (b6 === null || b7 === null || b8 === null || b9 === null) {
            return 0;
        }

        // Tag size is a 28-bit synchsafe integer in bytes 6-9
        const size = ((b6 & 0x7f) << 21) | ((b7 & 0x7f) << 14) | ((b8 & 0x7f) << 7) | (b9 & 0x7f);
        return 10 + size;
    }
    return 0;
}

/** Parse a frame header at `offset`. Returns the frame length in bytes, or null if invalid. */
export function frameLengthAt(buf: Buffer, offset: number): number | null {
    if (offset + 4 > buf.length) return null;

    const b1 = readByte(buf, offset);
    const b2 = readByte(buf, offset + 1);
    const b3 = readByte(buf, offset + 2);
    if (b1 === null || b2 === null || b3 === null) {
        return null;
    }

    // Sync word: 11 set bits (0xFF followed by top 3 bits of next byte)
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null;

    const versionBits = (b2 >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = reserved
    const layerBits = (b2 >> 1) & 0x03; // 3 = Layer I, 2 = Layer II, 1 = Layer III, 0 = reserved
    if (versionBits === 1 || layerBits === 0) return null;

    const layer = 4 - layerBits; // 1, 2, or 3
    const versionKey = versionBits === 3 ? 1 : 2;

    const bitrateIndex = (b3 >> 4) & 0x0f;
    const sampleRateIndex = (b3 >> 2) & 0x03;
    const padding = (b3 >> 1) & 0x01;

    if (bitrateIndex === 0 || bitrateIndex === 15) return null; // skip "free" and invalid
    if (sampleRateIndex === 3) return null;

    const bitrateTable = BITRATES[`${versionKey}-${layer}`];
    const bitrateKbps = bitrateTable?.[bitrateIndex];
    const sampleRateTable = SAMPLE_RATES[versionBits];
    const sampleRate = sampleRateTable?.[sampleRateIndex];
    if (bitrateKbps === undefined || sampleRate === undefined) {
        return null;
    }
    const bitrate = bitrateKbps * 1000;

    if (layer === 1) {
        return (Math.floor((12 * bitrate) / sampleRate) + padding) * 4;
    }
    // Layer II always uses 144. Layer III uses 144 for MPEG1, 72 for MPEG2/2.5.
    const coefficient = layer === 2 || versionBits === 3 ? 144 : 72;
    return Math.floor((coefficient * bitrate) / sampleRate) + padding;
}

/**
 * True if the valid frame at `offset` is a Xing/Info metadata frame — the silent header frame
 * encoders prepend to carry VBR/duration info. It is a real MPEG frame but carries no audio, so
 * reference tools (e.g. mediainfo) and the encoder's own frame count exclude it.
 * The "Xing"/"Info" tag sits after the side-information block, whose size depends on version/channels.
 */
export function isInfoFrame(buf: Buffer, offset: number): boolean {
    const b2 = readByte(buf, offset + 1);
    const b4 = readByte(buf, offset + 3);
    if (b2 === null || b4 === null) return false;

    const isMpeg1 = ((b2 >> 3) & 0x03) === 3;
    const isMono = ((b4 >> 6) & 0x03) === 3;
    // Side-info size (bytes after the 4-byte header) by version + channel mode.
    const sideInfo = isMpeg1 ? (isMono ? 17 : 32) : isMono ? 9 : 17;
    const tagOffset = offset + 4 + sideInfo;

    if (tagOffset + 4 > buf.length) return false;
    const tag = buf.toString("latin1", tagOffset, tagOffset + 4);
    return tag === "Xing" || tag === "Info";
}

/**
 * Frame length at `offset` when it looks like a real header, not a false sync inside audio data.
 * Requires the next frame's header to parse at the predicted position (two-frame check).
 * The final frame in the stream has no successor, so a lone valid header at EOF is accepted.
 */
export function confirmedFrameLengthAt(buf: Buffer, offset: number): number | null {
    const len = frameLengthAt(buf, offset);
    if (!len || len <= 4) {
        return null;
    }

    const nextOffset = offset + len;
    if (nextOffset + 4 > buf.length) {
        return len;
    }

    const nextLen = frameLengthAt(buf, nextOffset);
    if (!nextLen || nextLen <= 4) {
        return null;
    }

    return len;
}

/** Walk the buffer frame by frame and count valid frames. */
export function countMp3Frames(buf: Buffer): number {
    let offset = skipId3v2(buf);
    let frames = 0;

    while (offset < buf.length - 4) {
        const len = confirmedFrameLengthAt(buf, offset);
        if (len) {
            // Count audio frames only; the Xing/Info metadata frame is excluded (matches mediainfo).
            if (!isInfoFrame(buf, offset)) {
                frames++;
            }
            offset += len;
        } else {
            offset++;
        }
    }
    return frames;
}
