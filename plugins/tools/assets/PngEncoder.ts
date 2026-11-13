import { deflateSync } from "node:zlib";
import { Crc32 } from "../plugin/Crc32.js";

/**
 * Minimal PNG writer: 8-bit RGBA, filter type 0 on every scanline, no
 * ancillary chunks (no timestamps, no gamma), so the encoded pixels are a
 * pure function of the input. `scanlines` exposes the exact bytes that go
 * into IDAT, which tests compare against the committed files after inflating
 * them (compressed bytes may differ between zlib builds; pixels may not).
 */
export class PngEncoder {
  private static readonly SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  static scanlines(width: number, height: number, rgba: Uint8Array): Buffer {
    if (rgba.length !== width * height * 4) {
      throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
    }
    const stride = width * 4;
    const out = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      out[y * (stride + 1)] = 0;
      out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    return out;
  }

  static encode(width: number, height: number, rgba: Uint8Array): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.writeUInt8(8, 8); // bit depth
    header.writeUInt8(6, 9); // colour type RGBA
    header.writeUInt8(0, 10); // compression
    header.writeUInt8(0, 11); // filter
    header.writeUInt8(0, 12); // interlace
    const data = deflateSync(PngEncoder.scanlines(width, height, rgba), { level: 9 });
    return Buffer.concat([
      PngEncoder.SIGNATURE,
      PngEncoder.chunk("IHDR", header),
      PngEncoder.chunk("IDAT", data),
      PngEncoder.chunk("IEND", Buffer.alloc(0)),
    ]);
  }

  private static chunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBytes = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(Crc32.of(typeBytes, data), 0);
    return Buffer.concat([length, typeBytes, data, crc]);
  }
}
