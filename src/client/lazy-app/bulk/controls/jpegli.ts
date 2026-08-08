import type { EncodeOptions } from 'features/encoders/jpegli/shared/meta';
import { defineControl, type BulkControl } from './types';

export const jpegliControls: readonly BulkControl<EncodeOptions>[] = [
  defineControl({
    id: 'jpegli.quality',
    label: 'Quality',
    fields: ['quality'],
  }),
  defineControl({
    id: 'jpegli.chroma-subsampling',
    label: 'Chroma subsampling',
    fields: ['chromaSubsample'],
  }),
  defineControl({
    id: 'jpegli.progressive-rendering',
    label: 'Progressive rendering',
    fields: ['progressive'],
  }),
];
