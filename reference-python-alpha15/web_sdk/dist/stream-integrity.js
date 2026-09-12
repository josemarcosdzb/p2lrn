const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

function rotr(value, bits) { return (value >>> bits) | (value << (32 - bits)); }

export class Sha256State {
  constructor() {
    this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
    this.words = new Uint32Array(64);
  }

  update(input) {
    if (this.finished) throw new Error('SHA-256 state is already finalized.');
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.bytesHashed += bytes.byteLength;
    let offset = 0;
    if (this.bufferLength) {
      const needed = 64 - this.bufferLength;
      const take = Math.min(needed, bytes.byteLength);
      this.buffer.set(bytes.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.#process(this.buffer, 0);
        this.bufferLength = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.#process(bytes, offset);
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.buffer.set(bytes.subarray(offset), 0);
      this.bufferLength = bytes.byteLength - offset;
    }
    return this;
  }

  #process(bytes, offset) {
    const w = this.words;
    for (let i = 0; i < 16; i += 1) {
      const p = offset + i * 4;
      w[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = this.h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + h) >>> 0;
  }

  digestBytes() {
    if (!this.finished) {
      const bytesHashed = this.bytesHashed;
      this.buffer[this.bufferLength++] = 0x80;
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength, 64);
        this.#process(this.buffer, 0);
        this.bufferLength = 0;
      }
      this.buffer.fill(0, this.bufferLength, 56);
      const bits = BigInt(bytesHashed) * 8n;
      for (let i = 0; i < 8; i += 1) {
        this.buffer[63 - i] = Number((bits >> BigInt(i * 8)) & 0xFFn);
      }
      this.#process(this.buffer, 0);
      this.finished = true;
    }
    const output = new Uint8Array(32);
    for (let i = 0; i < 8; i += 1) {
      output[i * 4] = this.h[i] >>> 24;
      output[i * 4 + 1] = this.h[i] >>> 16;
      output[i * 4 + 2] = this.h[i] >>> 8;
      output[i * 4 + 3] = this.h[i];
    }
    return output;
  }

  digestString() {
    return `sha256:${[...this.digestBytes()].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
}

function baseMediaType(mediaType) {
  return String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
}

export async function verifiedBinaryBlob(stream, descriptor, {type = descriptor.mediaType, label = descriptor.path} = {}) {
  const media = baseMediaType(descriptor.mediaType);
  if (media === 'application/json' || media.endsWith('+json')) {
    throw new Error(`Streaming Blob verification is not valid for canonical JSON content: ${label}`);
  }
  const [blobBranch, verifyBranch] = stream.tee();
  const blobPromise = new Response(blobBranch).blob();
  const reader = verifyBranch.getReader();
  const hash = new Sha256State();
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    size += bytes.byteLength;
    if (size > descriptor.size) throw new Error(`Manifest size mismatch while streaming: ${label}`);
    hash.update(bytes);
  }
  if (size !== descriptor.size) throw new Error(`Manifest size mismatch while streaming: ${label}`);
  const calculated = hash.digestString();
  if (calculated !== descriptor.byteDigest) throw new Error(`byteDigest mismatch while streaming: ${label}`);
  if (calculated !== descriptor.contentDigest) throw new Error(`contentDigest mismatch while streaming: ${label}`);
  const blob = await blobPromise;
  if (blob.size !== descriptor.size) throw new Error(`Blob size mismatch after streaming: ${label}`);
  return blob.slice(0, blob.size, type || 'application/octet-stream');
}

export function verifiedBinaryStream(stream, descriptor, {label = descriptor.path, onVerified = null} = {}) {
  const media = baseMediaType(descriptor.mediaType);
  if (media === 'application/json' || media.endsWith('+json')) {
    throw new Error(`Streaming verification is not valid for canonical JSON content: ${label}`);
  }
  const hash = new Sha256State();
  let size = 0;
  return stream.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      size += bytes.byteLength;
      if (size > descriptor.size) throw new Error(`Manifest size mismatch while streaming: ${label}`);
      hash.update(bytes);
      controller.enqueue(bytes);
    },
    flush() {
      if (size !== descriptor.size) throw new Error(`Manifest size mismatch while streaming: ${label}`);
      const calculated = hash.digestString();
      if (calculated !== descriptor.byteDigest) throw new Error(`byteDigest mismatch while streaming: ${label}`);
      if (calculated !== descriptor.contentDigest) throw new Error(`contentDigest mismatch while streaming: ${label}`);
      if (typeof onVerified === 'function') onVerified();
    },
  }));
}
