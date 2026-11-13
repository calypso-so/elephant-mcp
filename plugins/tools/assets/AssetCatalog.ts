import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ElephantMark, type MarkOptions } from "./ElephantMark.js";

export interface AssetEntry {
  /** Path relative to the repository root. */
  readonly path: string;
  readonly mark: MarkOptions;
}

/** Every committed PNG and the mark options that produce it. */
export class AssetCatalog {
  static readonly ENTRIES: readonly AssetEntry[] = [
    { path: "profiles/elephant/assets/icon.png", mark: { style: "icon", size: 512, badge: false } },
    { path: "profiles/elephant/assets/logo.png", mark: { style: "logo", size: 1024, badge: false } },
    { path: "profiles/elephant-builder/assets/icon.png", mark: { style: "icon", size: 512, badge: true } },
    { path: "profiles/elephant-builder/assets/logo.png", mark: { style: "logo", size: 1024, badge: true } },
  ];

  static generate(root: string, log: (line: string) => void = () => {}): void {
    for (const entry of AssetCatalog.ENTRIES) {
      const destination = join(root, entry.path);
      mkdirSync(dirname(destination), { recursive: true });
      const bytes = new ElephantMark(entry.mark).png();
      writeFileSync(destination, bytes);
      log(`${entry.path} ${entry.mark.size}x${entry.mark.size} ${bytes.length} bytes`);
    }
  }
}
