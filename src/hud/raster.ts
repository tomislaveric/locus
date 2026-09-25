import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

export interface Canvas {
  width: number;
  height: number;
  pixels: Buffer;
}

export const createCanvas = (width: number, height: number): Canvas => ({ width, height, pixels: Buffer.alloc(width * height * 4) });

export const setPixel = (canvas: Canvas, x: number, y: number, red: number, green: number, blue: number, alpha = 255): void => {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  canvas.pixels[offset] = red;
  canvas.pixels[offset + 1] = green;
  canvas.pixels[offset + 2] = blue;
  canvas.pixels[offset + 3] = alpha;
};

export const fillRect = (canvas: Canvas, x: number, y: number, width: number, height: number, color: [number, number, number, number]): void => {
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) setPixel(canvas, column, row, ...color);
};

export const circle = (canvas: Canvas, x: number, y: number, radius: number, color: [number, number, number, number]): void => {
  for (let row = Math.floor(y - radius); row <= y + radius; row += 1) for (let column = Math.floor(x - radius); column <= x + radius; column += 1) if (Math.hypot(column - x, row - y) <= radius) setPixel(canvas, column, row, ...color);
};

export const line = (canvas: Canvas, fromX: number, fromY: number, toX: number, toY: number, color: [number, number, number, number]): void => {
  const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY)));
  for (let step = 0; step <= steps; step += 1) setPixel(canvas, Math.round(fromX + ((toX - fromX) * step) / steps), Math.round(fromY + ((toY - fromY) * step) / steps), ...color);
};

const glyphs: Record<string, string[]> = {
  " ": ["000", "000", "000", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"], "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
  N: ["101", "111", "111", "101", "101"], E: ["111", "100", "110", "100", "111"], X: ["101", "101", "010", "101", "101"], T: ["111", "010", "010", "010", "010"], M: ["101", "111", "111", "101", "101"], C: ["111", "100", "100", "100", "111"], O: ["111", "101", "101", "101", "111"], I: ["111", "010", "010", "010", "111"], L: ["100", "100", "100", "100", "111"], D: ["110", "101", "101", "101", "110"]
};

export const text = (canvas: Canvas, value: string, x: number, y: number, scale: number, color: [number, number, number, number]): void => {
  let cursor = x;
  for (const character of value.toUpperCase()) {
    const glyph = glyphs[character] ?? glyphs[" "];
    for (let row = 0; row < glyph.length; row += 1) for (let column = 0; column < glyph[row].length; column += 1) if (glyph[row][column] === "1") fillRect(canvas, cursor + column * scale, y + row * scale, scale, scale, color);
    cursor += (glyph[0].length + 1) * scale;
  }
};

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
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

export const writePng = async (file: string, canvas: Canvas): Promise<void> => {
  const rows = Buffer.alloc(canvas.height * (1 + canvas.width * 4));
  for (let y = 0; y < canvas.height; y += 1) canvas.pixels.copy(rows, y * (1 + canvas.width * 4) + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8; header[9] = 6;
  await writeFile(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
};
