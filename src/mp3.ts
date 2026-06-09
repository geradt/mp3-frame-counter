// MPEG audio frame parsing — hand-written, no decoding libraries.
//
// Scoped to MPEG Version 1, Layer III per the brief — the format of virtually all .mp3 files,
// including the provided samples. Other MPEG versions and layers are intentionally out of scope:
// such frames simply don't validate and are skipped. Supporting them would mean restoring the
// per-version/layer bitrate and sample-rate tables and the layer-dependent frame-length formula.

// MPEG1 Layer III bitrates (kbps), indexed by the 4-bit bitrate field. Index 0 = "free", 15 = invalid.
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

// MPEG1 sample rates (Hz), indexed by the 2-bit sample-rate field (index 3 is reserved).
const SAMPLE_RATES = [44100, 48000, 32000];

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
    // Require MPEG Version 1 (bits 11) and Layer III (bits 01); other versions/layers are out of scope.
    if (((b2 >> 3) & 0x03) !== 3 || ((b2 >> 1) & 0x03) !== 1) return null;

    const bitrateIndex = (b3 >> 4) & 0x0f;
    const sampleRateIndex = (b3 >> 2) & 0x03;
    const padding = (b3 >> 1) & 0x01;

    const bitrateKbps = BITRATES[bitrateIndex];
    const sampleRate = SAMPLE_RATES[sampleRateIndex];
    if (!bitrateKbps || sampleRate === undefined) {
        return null; // "free"/invalid bitrate, or reserved sample rate
    }

    // MPEG1 Layer III: frame length (bytes) = floor(144 * bitrate / sampleRate) + padding.
    return Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding;
}

/**
 * True if the valid frame at `offset` is a Xing/Info metadata frame — the silent header frame
 * encoders prepend to carry VBR/duration info. It is a real MPEG frame but carries no audio, so
 * reference tools (e.g. mediainfo) and the encoder's own frame count exclude it.
 * The "Xing"/"Info" tag sits after the side-information block (17 bytes mono, 32 bytes stereo for
 * MPEG1 Layer III).
 */
export function isInfoFrame(buf: Buffer, offset: number): boolean {
    const b4 = readByte(buf, offset + 3);
    if (b4 === null) return false;

    const isMono = ((b4 >> 6) & 0x03) === 3;
    const sideInfo = isMono ? 17 : 32;
    const tagOffset = offset + 4 + sideInfo;

    if (tagOffset + 4 > buf.length) return false;
    const tag = buf.toString("latin1", tagOffset, tagOffset + 4);
    return tag === "Xing" || tag === "Info";
}

/**
 * Forward scan over `buf`, counting confirmed audio frames. A frame is confirmed by a two-frame
 * check: another valid header must parse at the predicted next-frame position (this rejects false
 * syncs inside audio data). The Xing/Info metadata frame is not counted.
 *
 * `atEof` says whether `buf` ends the stream. At end-of-stream the final frame has no successor,
 * so a lone valid header is accepted. Mid-stream the scan stops as soon as it lacks the bytes to
 * decide and reports `consumed` (bytes it finished with) so a streaming caller can keep the
 * remainder and resume once more arrives. The per-position decisions are identical either way, so
 * streaming a file in chunks yields the same count as scanning it whole.
 */
function scan(buf: Buffer, atEof: boolean): { frames: number; consumed: number } {
    let pos = 0;
    let frames = 0;

    while (pos < buf.length - 4) {
        const len = frameLengthAt(buf, pos);
        if (len === null || len <= 4) {
            pos++; // not a valid header here — resync one byte
            continue;
        }

        const nextOffset = pos + len;
        if (nextOffset + 4 > buf.length) {
            if (!atEof) break; // mid-stream: wait for more data before confirming
            // End of stream: accept the final frame on its own valid header.
            if (!isInfoFrame(buf, pos)) frames++;
            pos += len;
            continue;
        }

        const nextLen = frameLengthAt(buf, nextOffset);
        if (nextLen === null || nextLen <= 4) {
            pos++; // false sync inside audio data — resync
            continue;
        }

        if (!isInfoFrame(buf, pos)) frames++;
        pos += len;
    }

    return { frames, consumed: pos };
}

/** Count the audio frames in a complete in-memory MP3 buffer. */
export function countMp3Frames(buf: Buffer): number {
    const audio = buf.subarray(skipId3v2(buf));
    return scan(audio, true).frames;
}

/**
 * Incremental counter for streaming an MP3 without holding the whole file in memory: feed it
 * chunks with `push()`, then call `end()` for the total. Memory stays bounded by a small leftover
 * window (at most a partial frame straddling a chunk boundary), not the file size — so a 5 GB file
 * costs the same as a 5 MB one.
 */
export function createStreamingFrameCounter() {
    let leftover: Buffer = Buffer.alloc(0);
    let frames = 0;
    let id3Resolved = false;
    let skipRemaining = 0;

    /** Drop a leading ID3v2 tag, which may itself span several chunks. True once aligned to audio. */
    function alignToAudio(atEof: boolean): boolean {
        if (!id3Resolved) {
            if (leftover.length < 10) {
                if (!atEof) return false; // need 10 bytes to tell whether a tag is present
                id3Resolved = true; // too short to hold a tag
            } else {
                skipRemaining = skipId3v2(leftover); // 0 when there is no tag
                id3Resolved = true;
            }
        }
        if (skipRemaining > 0) {
            const drop = Math.min(skipRemaining, leftover.length);
            leftover = leftover.subarray(drop);
            skipRemaining -= drop;
            if (skipRemaining > 0) return false; // tag continues into a later chunk
        }
        return true;
    }

    return {
        push(chunk: Buffer): void {
            leftover = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
            if (!alignToAudio(false)) return;
            const { frames: found, consumed } = scan(leftover, false);
            frames += found;
            if (consumed > 0) leftover = leftover.subarray(consumed);
        },
        end(): number {
            if (!alignToAudio(true)) return frames;
            frames += scan(leftover, true).frames;
            leftover = Buffer.alloc(0);
            return frames;
        },
    };
}
