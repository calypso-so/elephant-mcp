import { PngEncoder } from "./PngEncoder.js";
import { Raster, type Rgb } from "./Raster.js";
import { type Shape, Shapes } from "./Shapes.js";

export type MarkStyle = "icon" | "logo";

export interface MarkOptions {
  readonly style: MarkStyle;
  readonly size: number;
  /** Elephant Builder: adds a "+" badge in the lower right. */
  readonly badge: boolean;
}

/**
 * The Elephant mark: a front-facing elephant head (ears, head, curled
 * trunk, eyes) in the Calypso palette.
 *
 * - `icon`: cream elephant on a rounded deep-teal tile (directory icon).
 * - `logo`: deep-teal elephant on transparency, details cut out.
 *
 * All geometry is in unit coordinates, so every size renders the same
 * drawing. Rendering is pure arithmetic, so output is reproducible.
 */
export class ElephantMark {
  static readonly BRAND: Rgb = [0x24, 0x41, 0x4e]; // #24414E, manifest brandColor
  static readonly CREAM: Rgb = [0xf4, 0xf1, 0xe8]; // #F4F1E8, Calypso paper
  static readonly TAN: Rgb = [0xd9, 0xcf, 0xb8]; // inner ear
  static readonly INK: Rgb = [0x17, 0x16, 0x11]; // #171611, Calypso ink

  private static readonly HEAD = { cx: 0.5, cy: 0.42, r: 0.19 };

  constructor(private readonly options: MarkOptions) {}

  render(): Raster {
    const raster = new Raster(this.options.size);
    if (this.options.style === "icon") this.drawIcon(raster);
    else this.drawLogo(raster);
    if (this.options.badge) this.drawBadge(raster);
    return raster;
  }

  png(): Buffer {
    return PngEncoder.encode(this.options.size, this.options.size, this.render().rgba());
  }

  scanlines(): Buffer {
    return PngEncoder.scanlines(this.options.size, this.options.size, this.render().rgba());
  }

  private drawIcon(raster: Raster): void {
    const { BRAND, CREAM, TAN, INK } = ElephantMark;
    raster
      .fill(Shapes.roundedRect(0, 0, 1, 1, 0.22), BRAND)
      .fill(this.ears(), CREAM)
      .fill(this.innerEars(), TAN)
      .fill(this.headOutline(), BRAND)
      .fill(this.head(), CREAM)
      .fill(this.trunk(), CREAM)
      .fill(this.eyes(), INK);
  }

  private drawLogo(raster: Raster): void {
    const { BRAND } = ElephantMark;
    raster
      .fill(this.ears(), BRAND)
      .erase(this.innerEarCut())
      .erase(this.headOutline())
      .fill(this.head(), BRAND)
      .fill(this.trunk(), BRAND)
      .erase(this.eyes());
  }

  private drawBadge(raster: Raster): void {
    const { BRAND, CREAM } = ElephantMark;
    const cx = 0.8;
    const cy = 0.8;
    const arm = 0.055;
    const half = 0.016;
    const plus = Shapes.union(
      Shapes.rect(cx - arm, cy - half, cx + arm, cy + half),
      Shapes.rect(cx - half, cy - arm, cx + half, cy + arm),
    );
    if (this.options.style === "icon") {
      raster
        .fill(Shapes.circle(cx, cy, 0.145), BRAND)
        .fill(Shapes.circle(cx, cy, 0.12), CREAM)
        .fill(plus, BRAND);
    } else {
      raster.erase(Shapes.circle(cx, cy, 0.145)).fill(Shapes.circle(cx, cy, 0.12), BRAND).erase(plus);
    }
  }

  private ears(): Shape {
    return Shapes.union(Shapes.ellipse(0.29, 0.43, 0.175, 0.205), Shapes.ellipse(0.71, 0.43, 0.175, 0.205));
  }

  private innerEars(): Shape {
    return Shapes.union(Shapes.ellipse(0.265, 0.44, 0.1, 0.135), Shapes.ellipse(0.735, 0.44, 0.1, 0.135));
  }

  /** Logo variant: a thin crescent inside each ear keeps the ear readable. */
  private innerEarCut(): Shape {
    const left = Shapes.ellipse(0.265, 0.44, 0.1, 0.135);
    const leftInner = Shapes.ellipse(0.285, 0.44, 0.085, 0.118);
    const right = Shapes.ellipse(0.735, 0.44, 0.1, 0.135);
    const rightInner = Shapes.ellipse(0.715, 0.44, 0.085, 0.118);
    return {
      contains: (x, y) =>
        (left.contains(x, y) && !leftInner.contains(x, y)) || (right.contains(x, y) && !rightInner.contains(x, y)),
    };
  }

  private headOutline(): Shape {
    const { cx, cy, r } = ElephantMark.HEAD;
    return Shapes.circle(cx, cy, r + 0.018);
  }

  private head(): Shape {
    const { cx, cy, r } = ElephantMark.HEAD;
    return Shapes.circle(cx, cy, r);
  }

  /** Straight trunk down from the head, curling up to the right. */
  private trunk(): Shape {
    const half = 0.043;
    const curlRadius = 0.075;
    const curlCenterX = 0.5 + curlRadius;
    const bottom = 0.71;
    return Shapes.union(
      Shapes.segment(0.5, 0.5, 0.5, bottom, half),
      Shapes.arc(curlCenterX, bottom, curlRadius, -0.6, Math.PI, half),
    );
  }

  private eyes(): Shape {
    return Shapes.union(Shapes.circle(0.43, 0.39, 0.019), Shapes.circle(0.57, 0.39, 0.019));
  }
}
