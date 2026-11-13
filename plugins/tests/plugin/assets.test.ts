import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PngInfo } from "../../tools/plugin/PngInfo.js";
import { ProfileLoader } from "../../tools/plugin/ProfileLoader.js";
import { Fixtures } from "./Fixtures.js";

const SHARED_ASSETS = join(Fixtures.ROOT, "shared", "assets");

describe("assets", () => {
  const loader = new ProfileLoader(Fixtures.ROOT);

  for (const name of loader.available()) {
    it(`${name} ships the shared Elephant logo and icon`, () => {
      const profile = loader.load(name);
      for (const file of ["icon.png", "logo.png"]) {
        const shipped = profile.assets.get(file);
        assert.ok(shipped, `${file} missing`);
        assert.ok(shipped.equals(readFileSync(join(SHARED_ASSETS, file))), `${file} is not the shared brand file`);
      }
    });
  }

  it("the brand files are square PNGs with transparency, icon 512 and logo 1024", () => {
    const sizes = { "icon.png": 512, "logo.png": 1024 } as const;
    for (const [file, size] of Object.entries(sizes)) {
      const info = PngInfo.read(readFileSync(join(SHARED_ASSETS, file)));
      assert.ok(info, file);
      assert.equal(info.width, size);
      assert.equal(info.height, size);
      assert.ok(info.hasAlpha, file);
    }
  });

  it("a profile's own asset replaces the shared one of the same name", () => {
    const root = mkdtempSync(join(tmpdir(), "elephant-assets-"));
    cpSync(join(Fixtures.ROOT, "shared"), join(root, "shared"), { recursive: true });
    cpSync(join(Fixtures.ROOT, "profiles", "elephant"), join(root, "profiles", "elephant"), { recursive: true });
    mkdirSync(join(root, "profiles", "elephant", "assets"), { recursive: true });
    writeFileSync(join(root, "profiles", "elephant", "assets", "icon.png"), Buffer.from("override"));

    const assets = new ProfileLoader(root).load("elephant").assets;
    assert.equal(assets.get("icon.png")?.toString(), "override");
    assert.ok(assets.get("logo.png")?.equals(readFileSync(join(SHARED_ASSETS, "logo.png"))));
  });
});
