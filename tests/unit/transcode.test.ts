import { describe, expect, it } from 'vitest';
import {
  transcodeJpegToJxl,
  TranscodeUnsupportedError,
  type CompressOutcome,
} from '$lib/compress';
import type SvelteKitWorkerBridge from '$lib/sveltekit-worker-bridge';
import type { SourceImage } from 'client/lazy-app/image-pipeline';
import { fakeFile } from './fixtures';

// The success path needs a real JXL decoder in a worker, so it is covered by
// tests/e2e/jxl-transcode.spec.ts. What is worth pinning here is the branch e2e
// cannot reach without an exotic fixture: libjxl declining the JPEG. That is a
// null from the bridge, and it must become the distinctive error the editor
// catches to fall back to a pixel encode rather than any old failure.

function source(): SourceImage {
  const preprocessed = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  return {
    file: fakeFile('photo.jpg'),
    decoded: preprocessed,
    preprocessed,
  } as unknown as SourceImage;
}

function bridgeReturning(output: ArrayBuffer | null): SvelteKitWorkerBridge {
  return {
    jxlTranscode: () => Promise.resolve(output),
  } as unknown as SvelteKitWorkerBridge;
}

describe('transcodeJpegToJxl', () => {
  it('throws TranscodeUnsupportedError when libjxl declines the JPEG', async () => {
    const attempt: Promise<CompressOutcome> = transcodeJpegToJxl(
      source(),
      new AbortController().signal,
      bridgeReturning(null),
    );

    await expect(attempt).rejects.toBeInstanceOf(TranscodeUnsupportedError);
  });
});
