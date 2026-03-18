/**
 * Type declarations for gifenc v1.0.x
 * @see https://github.com/mattdesl/gifenc
 */

declare module 'gifenc' {
  /** An RGB color tuple [r, g, b] where each channel is 0–255. */
  type RGBColor = [number, number, number];

  /** An RGBA color tuple [r, g, b, a] where each channel is 0–255. */
  type RGBAColor = [number, number, number, number];

  /** A palette is an array of RGB or RGBA color tuples. */
  type Palette = RGBColor[] | RGBAColor[];

  interface WriteFrameOptions {
    /** Color palette for this frame (required for the first frame). */
    palette?: Palette;
    /** Frame delay in milliseconds. */
    delay?: number;
    /** Whether to use transparency. */
    transparent?: boolean;
    /** Index of the transparent color in the palette. */
    transparentIndex?: number;
    /** Repeat count for looping (0 = loop forever, -1 = no repeat). */
    repeat?: number;
    /** Color depth in bits. Default: 8. */
    colorDepth?: number;
    /** Disposal method (0–7). -1 for auto. */
    dispose?: number;
    /** Whether this is the first frame (used internally with auto mode). */
    first?: boolean;
  }

  interface GIFEncoderInstance {
    /** Write a frame of indexed pixel data. */
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    /** Finish writing the GIF. */
    finish(): void;
    /** Return a Uint8Array view of the encoded GIF bytes so far. */
    bytesView(): Uint8Array;
    /** Return a copy of the encoded GIF bytes. */
    bytes(): Uint8Array;
    /** Reset the encoder. */
    reset(): void;
    /** The underlying buffer. */
    readonly buffer: ArrayBuffer;
  }

  interface GIFEncoderOptions {
    /** Initial buffer capacity in bytes. Default: 4096. */
    initialCapacity?: number;
    /** Automatically write GIF header on first frame. Default: true. */
    auto?: boolean;
  }

  /** Create a new GIF encoder. */
  export function GIFEncoder(options?: GIFEncoderOptions): GIFEncoderInstance;

  type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  interface QuantizeOptions {
    /** Pixel format for quantization. Default: 'rgb565'. */
    format?: QuantizeFormat;
    /** Whether to clear alpha. Default: true. */
    clearAlpha?: boolean;
    /** Color to use when clearing alpha. Default: 0x00. */
    clearAlphaColor?: number;
    /** Alpha threshold below which to clear. Default: 0. */
    clearAlphaThreshold?: number;
    /** Snap alpha to 0 or 255. */
    oneBitAlpha?: boolean | number;
    /** Use sqrt for count weighting. Default: true. */
    useSqrt?: boolean;
  }

  /**
   * Quantize RGBA pixel data down to a limited palette.
   * @param data - RGBA Uint8Array pixel data
   * @param maxColors - Maximum number of colors (e.g. 256)
   * @param options - Quantization options
   * @returns An array of RGB color tuples
   */
  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): RGBColor[];

  /**
   * Map RGBA pixel data to palette indices.
   * @param data - RGBA Uint8Array pixel data
   * @param palette - Color palette from quantize()
   * @param format - Pixel format. Default: 'rgb565'
   * @returns Uint8Array of palette indices
   */
  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: QuantizeFormat,
  ): Uint8Array;

  export function nearestColorIndex(
    palette: Palette,
    color: RGBColor | RGBAColor,
    distanceFn?: (a: number[], b: number[]) => number,
  ): number;

  export function snapColorsToPalette(
    palette: Palette,
    targetPalette: Palette,
    threshold?: number,
  ): void;

  export function prequantize(
    data: Uint8Array | Uint8ClampedArray,
    options?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number },
  ): void;

  export default GIFEncoder;
}
