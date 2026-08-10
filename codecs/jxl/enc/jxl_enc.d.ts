export interface EncodeOptions {
  effort: number;
  quality: number;
  progressive: boolean;
  epf: number;
  lossyPalette: boolean;
  decodingSpeedTier: number;
  photonNoiseIso: number;
  lossyModular: boolean;
}

export interface JXLModule extends EmscriptenWasm.Module {
  encode(
    data: BufferSource,
    width: number,
    height: number,
    options: EncodeOptions,
  ): Uint8Array | null;
  /**
   * Repack a whole JPEG file's DCT coefficients into a reversible JXL, or null
   * when libjxl can't transcode this JPEG. Takes the file bytes, not pixels.
   */
  transcodeJPEG(data: BufferSource): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<JXLModule>;

export default moduleFactory;
