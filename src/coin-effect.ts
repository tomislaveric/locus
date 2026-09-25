import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

export const COIN_APPROACH_SECONDS = 3;
export const COIN_FINAL_EXPAND_SECONDS = 1;
export const COIN_COLLECT_SECONDS = 0.25;
export const COIN_REWARD_SECONDS = 0.95;

export interface CoinEffectAssets {
  coin: string;
  burst: string;
  reward: string;
}

interface Canvas {
  width: number;
  height: number;
  pixels: Buffer;
}

const glyphs: Record<string, string[]> = {
  "+": ["000", "010", "010", "111", "010", "010", "000"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  ".": ["000", "000", "000", "000", "000", "010", "010"],
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["111", "001", "001", "111", "100", "100", "111"],
  "3": ["111", "001", "001", "111", "001", "001", "111"],
  "4": ["101", "101", "101", "111", "001", "001", "001"],
  "5": ["111", "100", "100", "111", "001", "001", "111"],
  "6": ["111", "100", "100", "111", "101", "101", "111"],
  "7": ["111", "001", "001", "010", "010", "010", "010"],
  "8": ["111", "101", "101", "111", "101", "101", "111"],
  "9": ["111", "101", "101", "111", "001", "001", "111"],
  e: ["000", "111", "101", "111", "100", "100", "111"]
};

const createCanvas = (width: number, height: number): Canvas => ({
  width,
  height,
  pixels: Buffer.alloc(width * height * 4)
});

const setPixel = (canvas: Canvas, x: number, y: number, red: number, green: number, blue: number, alpha = 255): void => {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  canvas.pixels[offset] = red;
  canvas.pixels[offset + 1] = green;
  canvas.pixels[offset + 2] = blue;
  canvas.pixels[offset + 3] = alpha;
};

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};

const writePng = async (file: string, canvas: Canvas): Promise<void> => {
  const rows = Buffer.alloc(canvas.height * (1 + canvas.width * 4));
  for (let y = 0; y < canvas.height; y += 1) {
    const offset = y * (1 + canvas.width * 4);
    canvas.pixels.copy(rows, offset + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(rows)),
      pngChunk("IEND", Buffer.alloc(0))
    ])
  );
};

const createCoin = (): Canvas => {
  const canvas = createCanvas(240, 240);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const distance = Math.hypot(x - 120, y - 120);
      if (distance < 104) setPixel(canvas, x, y, 255, 204, 35);
      if (distance >= 82 && distance < 91) setPixel(canvas, x, y, 255, 244, 166);
      if (distance < 72) setPixel(canvas, x, y, 229, 165, 20);
    }
  }
  return canvas;
};

const createBurst = (): Canvas => {
  const canvas = createCanvas(320, 320);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const distance = Math.hypot(x - 160, y - 160);
      if (distance < 150) setPixel(canvas, x, y, 255, 221, 71, Math.round(175 * (1 - distance / 150)));
      if (distance > 105 && distance < 119) setPixel(canvas, x, y, 255, 247, 190, 220);
    }
  }
  return canvas;
};

const createReward = (value: number): Canvas => {
  const canvas = createCanvas(360, 110);
  const text = `+${value}`;
  const glyphWidth = [...text].reduce((total, character) => total + (glyphs[character]?.[0].length ?? 3) + 1, -1);
  const scale = Math.max(1, Math.min(12, Math.floor(330 / glyphWidth), Math.floor(84 / 7)));
  let cursor = Math.floor((canvas.width - glyphWidth * scale) / 2);
  const top = Math.floor((canvas.height - 7 * scale) / 2);
  for (const character of text) {
    const glyph = glyphs[character] ?? glyphs["0"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) setPixel(canvas, cursor + column * scale + x, top + row * scale + y, 255, 247, 190);
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
  return canvas;
};

export const createCoinEffectAssets = async (prefix: string, value: number): Promise<CoinEffectAssets> => {
  const assets = {
    coin: `${prefix}-coin.png`,
    burst: `${prefix}-burst.png`,
    reward: `${prefix}-reward.png`
  };
  await Promise.all([writePng(assets.coin, createCoin()), writePng(assets.burst, createBurst()), writePng(assets.reward, createReward(value))]);
  return assets;
};
