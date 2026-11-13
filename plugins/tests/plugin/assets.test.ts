import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";
import { AssetCatalog } from "../../tools/assets/AssetCatalog.js";
import { ElephantMark } from "../../tools/assets/ElephantMark.js";
import { PngInfo } from "../../tools/plugin/PngInfo.js";
import { Fixtures } from "./Fixtures.js";

/** Concatenated, inflated IDAT payload: the PNG's filtered scanlines. */
function scanlines(png: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") parts.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  return inflateSync(Buffer.concat(parts));
}

describe("assets", () => {
  for (const entry of AssetCatalog.ENTRIES) {
    it(`${entry.path} is reproduced exactly by the generator`, () => {
      const committed = readFileSync(join(Fixtures.ROOT, entry.path));
      const info = PngInfo.read(committed);
      assert.ok(info);
      assert.equal(info.width, entry.mark.size);
      assert.equal(info.height, entry.mark.size);
      assert.ok(info.hasAlpha);
      assert.ok(scanlines(committed).equals(new ElephantMark(entry.mark).scanlines()), "pixels differ; run npm run assets");
    });
  }

  it("renders a transparent background for the logo and an opaque tile for the icon", () => {
    const logo = new ElephantMark({ style: "logo", size: 64, badge: false }).render().rgba();
    const icon = new ElephantMark({ style: "icon", size: 64, badge: false }).render().rgba();
    assert.equal(logo[3], 0);
    const centre = (32 * 64 + 2) * 4;
    assert.equal(icon[centre + 3], 255);
  });
});
