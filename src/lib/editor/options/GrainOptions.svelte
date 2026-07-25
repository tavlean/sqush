<script lang="ts">
  // Amount is the whole story for the film look — the calibrated model pins
  // the grain's character (docs/project/specs/2026-07-12-film-grain.md). Size hides
  // under Advanced because it serves a different job: 2px grain survives
  // lossy encoding at a fraction of the byte cost, which is what you want for
  // debanding rather than aesthetics. Mutates the grain processor options in
  // place.
  import Range from './Range.svelte';
  import OptionRow from './OptionRow.svelte';
  import AdvancedSection from './AdvancedSection.svelte';
  import type { GrainOptionsState } from './processor-types';

  let { options }: { options: GrainOptionsState } = $props();
</script>

<form class="options-section" onsubmit={(e) => e.preventDefault()}>
  <OptionRow>
    <Range min={0} max={100} bind:value={options.amount}>Amount:</Range>
  </OptionRow>
  <AdvancedSection>
    <OptionRow>
      <Range min={1} max={100} bind:value={options.size}>Grain size:</Range>
    </OptionRow>
  </AdvancedSection>
</form>
