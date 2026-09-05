import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export const OFFICIAL_KINGS_LOGO_FILE_SHA256 = "46575e83e6e5e68c77ce3523017817dd32ef954397554f618768b91c17939026";
export const OFFICIAL_KINGS_LOGO_PIXEL_SHA256 = "593606dedc7e2e4ec47d492633959122fb74e3e59c7fd91546bfef13f81ad8ae";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

export function assertOfficialKingsLogo(png) {
  assert.ok(Buffer.isBuffer(png), "official K.I.N.G.S. logo must be loaded as bytes");
  assert.ok(png.length > 1000, "official K.I.N.G.S. logo is unexpectedly small");
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, "official K.I.N.G.S. logo must remain a PNG");

  const fileSha256 = createHash("sha256").update(png).digest("hex");
  assert.equal(
    fileSha256,
    OFFICIAL_KINGS_LOGO_FILE_SHA256,
    "official K.I.N.G.S. AI PNG bytes changed without an explicit branding update",
  );

  const decoded = decodeIndexedPng(png);
  assert.equal(decoded.width, 256, "tracked official logo derivative width changed unexpectedly");
  assert.equal(decoded.height, 256, "tracked official logo derivative height changed unexpectedly");
  const pixelSha256 = createHash("sha256").update(decoded.rgba).digest("hex");
  assert.equal(
    pixelSha256,
    OFFICIAL_KINGS_LOGO_PIXEL_SHA256,
    "tracked PNG no longer decodes to the owner-approved K.I.N.G.S. crest pixels",
  );

  return { fileSha256, pixelSha256, width: decoded.width, height: decoded.height };
}

function decodeIndexedPng(png) {
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette;
  let transparency;
  const idat = [];

  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end + 4 <= png.length, `PNG chunk ${type} exceeds the file boundary`);
    const data = png.subarray(start, end);

    if (type === "IHDR") {
      assert.equal(length, 13, "PNG IHDR length is invalid");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert.equal(data[10], 0, "unsupported PNG compression method");
      assert.equal(data[11], 0, "unsupported PNG filter method");
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }

  assert.ok(Number.isInteger(width) && width > 0, "PNG width is missing");
  assert.ok(Number.isInteger(height) && height > 0, "PNG height is missing");
  assert.equal(bitDepth, 8, "official crest derivative must remain 8-bit indexed PNG");
  assert.equal(colorType, 3, "official crest derivative must remain indexed-color PNG");
  assert.equal(interlace, 0, "interlaced official crest PNG is not supported by the integrity decoder");
  assert.ok(palette && palette.length >= 3 && palette.length % 3 === 0, "PNG palette is missing or invalid");
  assert.ok(idat.length > 0, "PNG IDAT payload is missing");

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width;
  const expected = height * (stride + 1);
  assert.equal(inflated.length, expected, "PNG inflated scanline length changed unexpectedly");
  const indexes = Buffer.alloc(width * height);
  let prior = Buffer.alloc(stride);

  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (stride + 1);
    const filter = inflated[rowOffset];
    const encoded = inflated.subarray(rowOffset + 1, rowOffset + 1 + stride);
    const decoded = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x > 0 ? decoded[x - 1] : 0;
      const up = prior[x] ?? 0;
      const upLeft = x > 0 ? prior[x - 1] : 0;
      const value = encoded[x];
      if (filter === 0) decoded[x] = value;
      else if (filter === 1) decoded[x] = (value + left) & 0xff;
      else if (filter === 2) decoded[x] = (value + up) & 0xff;
      else if (filter === 3) decoded[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) decoded[x] = (value + paeth(left, up, upLeft)) & 0xff;
      else assert.fail(`unsupported PNG filter type ${filter}`);
    }
    decoded.copy(indexes, row * stride);
    prior = decoded;
  }

  const colors = palette.length / 3;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < indexes.length; i += 1) {
    const index = indexes[i];
    assert.ok(index < colors, `PNG palette index ${index} is out of range`);
    const source = index * 3;
    const target = i * 4;
    rgba[target] = palette[source];
    rgba[target + 1] = palette[source + 1];
    rgba[target + 2] = palette[source + 2];
    rgba[target + 3] = transparency && index < transparency.length ? transparency[index] : 255;
  }

  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
