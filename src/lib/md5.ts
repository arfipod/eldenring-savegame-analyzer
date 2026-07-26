/**
 * Small, dependency-free MD5 implementation used only to validate the checksums
 * already stored in a save. It never writes to the save.
 */
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const K = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0,
);

const rotateLeft = (value: number, amount: number): number =>
  ((value << amount) | (value >>> (32 - amount))) >>> 0;

export function md5Bytes(input: Uint8Array): Uint8Array {
  const originalLength = input.length;
  const bitLength = BigInt(originalLength) * 8n;
  const paddedLength = Math.ceil((originalLength + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[originalLength] = 0x80;

  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Number(bitLength & 0xffff_ffffn), true);
  view.setUint32(paddedLength - 4, Number((bitLength >> 32n) & 0xffff_ffffn), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;

      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const word = view.getUint32(offset + g * 4, true);
      const nextD = d;
      d = c;
      c = b;
      const sum = (a + f + (K[index] ?? 0) + word) >>> 0;
      b = (b + rotateLeft(sum, SHIFT[index] ?? 0)) >>> 0;
      a = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return digest;
}

export function md5Hex(input: Uint8Array): string {
  return Array.from(md5Bytes(input), (value) => value.toString(16).padStart(2, '0')).join('');
}
