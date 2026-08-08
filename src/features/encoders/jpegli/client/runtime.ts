import type { EncodeOptions } from '../shared/meta';

export interface JpegliEncodeWorkerBridge {
  jpegliEncode(
    signal: AbortSignal,
    imageData: ImageData,
    options: EncodeOptions,
  ): Promise<ArrayBuffer> | Promise<Promise<ArrayBuffer>>;
}

export function encode(
  signal: AbortSignal,
  workerBridge: JpegliEncodeWorkerBridge,
  imageData: ImageData,
  options: EncodeOptions,
) {
  return workerBridge.jpegliEncode(signal, imageData, options);
}
