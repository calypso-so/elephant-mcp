/**
 * A region of the unit square (x right, y down, both 0..1), expressed as a
 * point-membership test. The raster anti-aliases by supersampling.
 */
export interface Shape {
  contains(x: number, y: number): boolean;
}

/** Factory for the primitive shapes the Elephant mark is drawn from. */
export class Shapes {
  static circle(cx: number, cy: number, r: number): Shape {
    return { contains: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r };
  }

  static ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
    return { contains: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 };
  }

  static rect(x0: number, y0: number, x1: number, y1: number): Shape {
    return { contains: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 };
  }

  static roundedRect(x0: number, y0: number, x1: number, y1: number, radius: number): Shape {
    return {
      contains: (x, y) => {
        if (x < x0 || x > x1 || y < y0 || y > y1) return false;
        const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
        const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
        return dx * dx + dy * dy <= radius * radius;
      },
    };
  }

  /** A straight stroke with round caps (a capsule). */
  static segment(ax: number, ay: number, bx: number, by: number, halfWidth: number): Shape {
    const vx = bx - ax;
    const vy = by - ay;
    const lengthSquared = vx * vx + vy * vy;
    return {
      contains: (x, y) => {
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / lengthSquared));
        return (x - (ax + t * vx)) ** 2 + (y - (ay + t * vy)) ** 2 <= halfWidth * halfWidth;
      },
    };
  }

  /**
   * A circular arc stroke with round caps. Angles are radians,
   * clockwise from +x (y points down), swept from `start` to `end`.
   */
  static arc(cx: number, cy: number, radius: number, start: number, end: number, halfWidth: number): Shape {
    const startCap = Shapes.circle(cx + radius * Math.cos(start), cy + radius * Math.sin(start), halfWidth);
    const endCap = Shapes.circle(cx + radius * Math.cos(end), cy + radius * Math.sin(end), halfWidth);
    return {
      contains: (x, y) => {
        if (startCap.contains(x, y) || endCap.contains(x, y)) return true;
        if (Math.abs(Math.hypot(x - cx, y - cy) - radius) > halfWidth) return false;
        let angle = Math.atan2(y - cy, x - cx);
        while (angle < start) angle += 2 * Math.PI;
        return angle <= end;
      },
    };
  }

  static union(...shapes: readonly Shape[]): Shape {
    return { contains: (x, y) => shapes.some((shape) => shape.contains(x, y)) };
  }
}
