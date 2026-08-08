# JPEG (jpegli)

> The same universal `.jpg` file, from a newer encoder that spends its bytes more carefully: around 30% better quality-per-byte than a conventional JPEG at high quality, with three controls instead of sixteen. Encoded with **jpegli** (shown as **JPEG (jpegli)** in the menu).

## Overview / When to use it

**jpegli** is Google's modern JPEG encoder. It is not a new format: the file it writes is an ordinary JPEG, and every browser, phone, printer and photo app on earth already reads it. What changed is the encoder's judgement about which detail is worth keeping, and Google's own measurements put it at roughly 30% better quality-per-byte than libjpeg-turbo at high quality.

Frisp offers it beside the existing **JPEG** entry, which is encoded with MozJPEG. Both produce `.jpg`; they simply disagree about how to get there. MozJPEG is the older, extremely well-understood option with a deep bag of tuning knobs. jpegli is the newer one whose whole argument is that you should not need those knobs, because its quantization tables and adaptive quantization are already tuned. That is why this page is short and the [MozJPEG page](./mozjpeg.md) is long.

Reach for jpegli when you want a JPEG and would rather not think about it. Reach for MozJPEG when you want to hand-tune, when you need grayscale or RGB output, or when you are matching an existing pipeline's settings exactly. As with any JPEG: no transparency. If your image has see-through areas, use PNG, WebP, or AVIF.

Worth knowing before you commit a whole library to it: jpegli is newer than MozJPEG and Frisp added it recently, so there is less accumulated field experience behind it. The output is a standard JPEG, so nothing is locked in either way. Compare the two on your own images with the side-by-side preview.

## Controls / Settings

### Quality

- **What it does:** Sets how much detail the encoder keeps. Lower values discard more to make the file smaller; higher values preserve more at the cost of size.
- **Range & default:** 0 to 100, in steps of 1. **Default: 75** (option key `quality`).
- **How to choose:** The number is on jpegli's own quality scale, not libjpeg's, so **a jpegli 75 is not the same picture as a MozJPEG 75** and the file sizes are not directly comparable either. Treat the slider as its own thing and judge it in the preview rather than by matching numbers across encoders. As with any JPEG the top of the range is expensive: 95 to 100 costs a lot of bytes for very little you can see.
- **Recommended starting point:** **75**. Try **80–85** for hero images or anything with text and sharp edges; drop to **60–70** for thumbnails and backgrounds.

### Chroma subsampling

- **What it does:** Chooses how much the _colour_ detail is compressed relative to the brightness detail. Human eyes are far more sensitive to brightness than to colour, so JPEG can store colour at a lower resolution with little visible loss.
- **Range & default:** **Auto**, **4:4:4**, or **4:2:0**. **Default: Auto** (option key `chromaSubsample`, values 0 / 1 / 2). Under **Advanced settings**.
- **How to choose:**
  - **Auto** leaves the decision to jpegli, which currently means 4:2:0 (colour stored at half resolution in both directions). This is the right answer for photographs.
  - **4:4:4** keeps colour at full resolution. Use it when the image has saturated coloured text, thin coloured lines, or hard colour edges, and you can see them smearing in the preview. Files get bigger.
  - **4:2:0** forces the same behaviour Auto currently gives. It exists so you can pin it rather than inherit it.
- **Recommended starting point:** **Auto**. Switch to **4:4:4** only when you have seen colour bleeding in the preview.

### Progressive rendering

- **What it does:** Stores the image so it loads in increasingly sharp passes, a blurry-to-clear reveal, rather than top-to-bottom.
- **Range & default:** On/off. **Default: on** (option key `progressive`). Under **Advanced settings**.
- **How to choose:** Keep it **on** for web images. It usually also makes the file slightly smaller. Turn it **off** if something downstream insists on a plain sequential JPEG.
- **Recommended starting point:** **On**.

## Tips & pitfalls

- **Do not compare quality numbers across encoders.** jpegli's slider maps onto its own internal quality target. Comparing "jpegli at 75" with "MozJPEG at 75" tells you nothing useful; compare the two at whatever settings each one looks right at, then compare the file sizes.
- **The short options list is the point.** There is no trellis section, no quantization-table picker, no separate chroma quality. jpegli's tuned defaults are what it is for. If you want those knobs, the [JPEG (MozJPEG)](./mozjpeg.md) page has all of them.
- **No grayscale or RGB mode.** jpegli encodes colour as YCbCr, which is what virtually every JPEG in the world uses. A genuinely black-and-white source still works, it is just stored as a colour JPEG. If you need a true grayscale JPEG, use MozJPEG and set **Channels** to Grayscale.
- **JPEG still cannot do transparency.** Transparent areas will be filled or mangled. Use PNG, WebP, or AVIF.
- **Try both JPEG encoders on a representative image.** They differ most on synthetic content (screenshots, flat illustration) and least on photographs. Two minutes with the side-by-side preview beats any general rule.

## Under the hood

jpegli comes out of the JPEG XL project: it applies techniques developed for JPEG XL to the plain old JPEG bitstream, so you get better decisions about what to keep without changing the format. The main levers are adaptive quantization (spending bits where the eye will notice, block by block) and quantization tables tuned against perceptual metrics rather than the 1992 defaults. It runs entirely in your browser via WebAssembly, like every other codec in Frisp, so no image ever leaves your device. The exact upstream commit Frisp builds from is recorded in `docs/codec-provenance.md`.
