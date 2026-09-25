import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

const glyphs: Record<string, string[]> = {
  " ": ["000", "000", "000", "000", "000", "000", "000"],
  "+": ["000", "010", "010", "111", "010", "010", "000"],
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  C: ["111", "100", "100", "100", "100", "100", "111"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  N: ["101", "111", "111", "101", "101", "101", "101"],
  O: ["111", "101", "101", "101", "101", "101", "111"],
  P: ["110", "101", "101", "110", "100", "100", "100"],
  X: ["101", "101", "010", "010", "010", "101", "101"]
};

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};

export const createOverlay = async (file: string, value: number): Promise<void> => {
  const width = 360;
  const height = 140;
  const pixels = Buffer.alloc(width * height * 4);
  const setPixel = (x: number, y: number, red: number, green: number, blue: number, alpha = 255): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = alpha;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel(x, y, 15, 20, 30, 175);
  }
  for (let y = 12; y < 128; y += 1) {
    for (let x = 12; x < 128; x += 1) {
      const distance = Math.hypot(x - 70, y - 70);
      if (distance < 55) setPixel(x, y, 255, 214, 45);
      if (distance > 43 && distance < 48) setPixel(x, y, 255, 246, 180);
    }
  }

  const text = `COIN +${value} XP`;
  const scale = 7;
  let cursor = 145;
  for (const character of text) {
    const glyph = glyphs[character];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          for (let y = 0; y < scale; y += 1) {
            for (let x = 0; x < scale; x += 1) setPixel(cursor + column * scale + x, 45 + row * scale + y, 255, 255, 255);
          }
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }

  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const start = y * (1 + width * 4);
    rows[start] = 0;
    pixels.copy(rows, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0))
  ]);
  await writeFile(file, png);
};
