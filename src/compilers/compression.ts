/**
 * Pure TypeScript LZ4 (Block + Frame) and FastLZ Level-1 Compressors & Decompressors
 * plus CRC16-CCITT and CRC32 checksum calculators for VeryFit (.iwf.lz) and FitCloudPro (.bin).
 */

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc16Ccitt(data: Uint8Array, init = 0xffff): number {
  let crc = init;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc & 0xffff;
}

/**
 * Standard LZ4 raw block compressor
 */
export function lz4CompressBlock(src: Uint8Array): Uint8Array {
  const n = src.length;
  if (n === 0) return new Uint8Array(0);

  const maxOut = n + Math.ceil(n / 255) + 16;
  const out = new Uint8Array(maxOut);
  let op = 0;

  const htab = new Int32Array(1 << 16).fill(-1);
  let anchor = 0;
  let ip = 0;
  const limit = n - 12;
  const matchLimit = n - 5;

  const hash4 = (pos: number): number => {
    const v =
      src[pos] |
      (src[pos + 1] << 8) |
      (src[pos + 2] << 16) |
      (src[pos + 3] << 24);
    return (Math.imul(v, 2654435761) >>> 16) & 0xffff;
  };

  while (ip < limit) {
    const h = hash4(ip);
    const ref = htab[h];
    htab[h] = ip;

    if (
      ref >= 0 &&
      ip - ref <= 0xffff &&
      src[ref] === src[ip] &&
      src[ref + 1] === src[ip + 1] &&
      src[ref + 2] === src[ip + 2] &&
      src[ref + 3] === src[ip + 3]
    ) {
      const litLen = ip - anchor;
      const tokenPos = op++;

      let mlen = 4;
      while (ip + mlen < matchLimit && src[ref + mlen] === src[ip + mlen]) {
        mlen++;
      }

      let token = Math.min(litLen, 15) << 4;
      if (litLen >= 15) {
        let rem = litLen - 15;
        while (rem >= 255) {
          out[op++] = 255;
          rem -= 255;
        }
        out[op++] = rem;
      }

      for (let i = 0; i < litLen; i++) {
        out[op++] = src[anchor + i];
      }

      const offset = ip - ref;
      out[op++] = offset & 0xff;
      out[op++] = (offset >>> 8) & 0xff;

      const matchDec = mlen - 4;
      token |= Math.min(matchDec, 15);
      out[tokenPos] = token;

      if (matchDec >= 15) {
        let rem = matchDec - 15;
        while (rem >= 255) {
          out[op++] = 255;
          rem -= 255;
        }
        out[op++] = rem;
      }

      ip += mlen;
      anchor = ip;
      if (ip < limit) {
        htab[hash4(ip - 2)] = ip - 2;
      }
    } else {
      ip++;
    }
  }

  // Trailing literals
  const lastLit = n - anchor;
  const tokenPos = op++;
  out[tokenPos] = Math.min(lastLit, 15) << 4;
  if (lastLit >= 15) {
    let rem = lastLit - 15;
    while (rem >= 255) {
      out[op++] = 255;
      rem -= 255;
    }
    out[op++] = rem;
  }
  for (let i = 0; i < lastLit; i++) {
    out[op++] = src[anchor + i];
  }

  return out.subarray(0, op);
}

/**
 * Standard LZ4 raw block decompressor
 */
export function lz4DecompressBlock(
  src: Uint8Array,
  uncompressedSize: number
): Uint8Array {
  const out = new Uint8Array(uncompressedSize);
  let ip = 0;
  let op = 0;

  while (ip < src.length && op < uncompressedSize) {
    const token = src[ip++];
    let litLen = token >>> 4;
    if (litLen === 15) {
      let s = 255;
      while (s === 255 && ip < src.length) {
        s = src[ip++];
        litLen += s;
      }
    }

    for (let i = 0; i < litLen && ip < src.length; i++) {
      out[op++] = src[ip++];
    }

    if (ip >= src.length || op >= uncompressedSize) break;

    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    if (offset === 0) break;

    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let s = 255;
      while (s === 255 && ip < src.length) {
        s = src[ip++];
        matchLen += s;
      }
    }

    let ref = op - offset;
    for (let i = 0; i < matchLen && op < uncompressedSize; i++) {
      out[op++] = out[ref++];
    }
  }

  return out.subarray(0, op);
}

/**
 * Wraps an LZ4 compressed stream in an IWF/LZ4 header container
 * Magic: 0x04 0x22 0x4D 0x18 (LZ4 Frame Magic) + 4-byte LE uncompressed size + 4-byte LE block size + block
 */
export function compressIwfLz4(src: Uint8Array): Uint8Array {
  const block = lz4CompressBlock(src);
  const out = new Uint8Array(16 + block.length);
  const view = new DataView(out.buffer);
  // Standard LZ4 magic 0x184D2204
  view.setUint32(0, 0x184d2204, true);
  // Uncompressed size
  view.setUint32(4, src.length, true);
  // Compressed block length
  view.setUint32(8, block.length, true);
  // Checksum
  view.setUint32(12, crc32(src), true);
  out.set(block, 16);
  return out;
}

/**
 * Pure TypeScript FastLZ Level-1 compressor (used by IDO / VeryFit RTOS SDK)
 */
export function fastlz1Compress(src: Uint8Array): Uint8Array {
  const n = src.length;
  if (n < 16) {
    const out = new Uint8Array(n + 1);
    out[0] = (n - 1) & 0x1f;
    out.set(src, 1);
    return out;
  }

  const out = new Uint8Array(Math.ceil(n * 1.15) + 32);
  let op = 0;
  const htab = new Int32Array(8192).fill(0);

  const hash3 = (p: number): number => {
    const v = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16);
    return ((v * 2654435769) >>> 19) & 0x1fff;
  };

  const emitLiterals = (start: number, count: number) => {
    let pos = start;
    let rem = count;
    while (rem > 0) {
      const run = Math.min(rem, 32);
      out[op++] = run - 1;
      for (let i = 0; i < run; i++) {
        out[op++] = src[pos + i];
      }
      pos += run;
      rem -= run;
    }
  };

  let anchor = 0;
  let ip = 2;
  htab[hash3(0)] = 0;
  htab[hash3(1)] = 1;

  while (ip < n - 12) {
    const h = hash3(ip);
    const ref = htab[h];
    htab[h] = ip;
    const distance = ip - ref;

    if (
      distance > 0 &&
      distance <= 8191 &&
      src[ref] === src[ip] &&
      src[ref + 1] === src[ip + 1] &&
      src[ref + 2] === src[ip + 2]
    ) {
      if (ip > anchor) {
        emitLiterals(anchor, ip - anchor);
      }

      let mlen = 3;
      const maxLen = Math.min(264, n - ip - 2);
      while (mlen < maxLen && src[ref + mlen] === src[ip + mlen]) {
        mlen++;
      }

      const d = distance - 1;
      let remMatch = mlen;
      while (remMatch >= 3) {
        const chunk = Math.min(remMatch, 264);
        const lenCode = chunk - 2;
        if (lenCode < 7) {
          out[op++] = (lenCode << 5) | (d >>> 8);
          out[op++] = d & 0xff;
        } else {
          out[op++] = (7 << 5) | (d >>> 8);
          out[op++] = lenCode - 7;
          out[op++] = d & 0xff;
        }
        remMatch -= chunk;
      }

      const consumed = mlen - remMatch;
      ip += consumed;
      anchor = ip;
    } else {
      ip++;
    }
  }

  if (anchor < n) {
    emitLiterals(anchor, n - anchor);
  }

  // Prepend 8-byte FastLZ container header: "FLZ1" + uint32LE(uncompressedSize)
  const container = new Uint8Array(8 + op);
  container[0] = 0x46; // 'F'
  container[1] = 0x4c; // 'L'
  container[2] = 0x5a; // 'Z'
  container[3] = 0x31; // '1'
  new DataView(container.buffer).setUint32(4, n, true);
  container.set(out.subarray(0, op), 8);
  return container;
}

export function fastlz1Decompress(
  src: Uint8Array,
  uncompressedSize: number
): Uint8Array {
  const out = new Uint8Array(uncompressedSize);
  let ip = 0;
  let op = 0;

  while (ip < src.length && op < uncompressedSize) {
    const ctrl = src[ip++];
    if (ctrl < 32) {
      const run = ctrl + 1;
      for (let i = 0; i < run && ip < src.length && op < uncompressedSize; i++) {
        out[op++] = src[ip++];
      }
    } else {
      let len = (ctrl >>> 5) - 1;
      const ofsHigh = (ctrl & 0x1f) << 8;
      if (len === 6) {
        len += src[ip++];
      }
      const ofsLow = src[ip++];
      const ref = op - ofsHigh - ofsLow - 1;
      const totalCopy = len + 3;
      for (let i = 0; i < totalCopy && op < uncompressedSize; i++) {
        out[op++] = out[ref + i];
      }
    }
  }

  return out.subarray(0, op);
}
