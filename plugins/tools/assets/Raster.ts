import type { Shape } from "./Shapes.js";

export type Rgb = readonly [number, number, number];

/**
 * Square RGBA canvas with source-over compositing. Each pixel's coverage is
 * the fraction of an N×N grid of sample points inside the shape, which gives
 * smooth edges without any platform renderer, so output is reproducible.
 */
export class Raster {
  private readonly pixels: Float64Array;

  constructor(
    readonly size: number,
    private readonly samples = 4,
  ) {
    this.pixels = new Float64Array(size * size * 4);
  }

  /** Paints `shape` in `color` (0–255 per channel) at the given opacity. */
  fill(shape: Shape, color: Rgb, opacity = 1): this {
    this.forEachCovered(shape, (index, coverage) => {
      const alpha = coverage * opacity;
      const base = this.pixels[index + 3] ?? 0;
      const outAlpha = alpha + base * (1 - alpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const source = (color[channel] ?? 0) / 255;
        const destination = this.pixels[index + channel] ?? 0;
        this.pixels[index + channel] =
          outAlpha === 0 ? 0 : (source * alpha + destination * base * (1 - alpha)) / outAlpha;
      }
      this.pixels[index + 3] = outAlpha;
    });
    return this;
  }

  /** Removes `shape` from the canvas (destination-out). */
  erase(shape: Shape): this {
    this.forEachCovered(shape, (index, coverage) => {
      this.pixels[index + 3] = (this.pixels[index + 3] ?? 0) * (1 - coverage);
    });
    return this;
  }

  rgba(): Uint8Array {
    const out = new Uint8Array(this.pixels.length);
    for (let index = 0; index < this.pixels.length; index += 4) {
      const alpha = this.pixels[index + 3] ?? 0;
      const a = Math.round(alpha * 255);
      out[index + 3] = a;
      if (a === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        out[index + channel] = Math.round((this.pixels[index + channel] ?? 0) * 255);
      }
    }
    return out;
  }

  private forEachCovered(shape: Shape, apply: (index: number, coverage: number) => void): void {
    const n = this.samples;
    const total = n * n;
    for (let py = 0; py < this.size; py += 1) {
      for (let px = 0; px < this.size; px += 1) {
        let inside = 0;
        for (let sy = 0; sy < n; sy += 1) {
          const y = (py + (sy + 0.5) / n) / this.size;
          for (let sx = 0; sx < n; sx += 1) {
            if (shape.contains((px + (sx + 0.5) / n) / this.size, y)) inside += 1;
          }
        }
        if (inside > 0) apply((py * this.size + px) * 4, inside / total);
      }
    }
  }
}
