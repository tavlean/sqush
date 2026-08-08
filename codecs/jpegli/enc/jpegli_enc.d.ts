export interface EncodeOptions {
  quality: number;
  progressive: boolean;
  /** 0 = jpegli's default, 1 = force 4:4:4, 2 = force 4:2:0. */
  chromaSubsample: number;
}

export interface JpegliModule extends EmscriptenWasm.Module {
  encode(
    data: BufferSource,
    width: number,
    height: number,
    options: EncodeOptions,
  ): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<JpegliModule>;

export default moduleFactory;
