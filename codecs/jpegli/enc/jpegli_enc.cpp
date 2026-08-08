#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <csetjmp>
#include <cstdint>
#include <cstdlib>
#include <string>

#include "lib/jpegli/encode.h"

using namespace emscripten;

struct JpegliOptions {
  int quality;
  bool progressive;
  int chromaSubsample;
};

// jpegli reports every failure by longjmp-ing out of the compressor, and its
// default handler calls exit(), which would take the whole codec worker down
// with it. Replacing the handler turns a failed encode into a val::null() the
// app can show as "no output". Modelled on lib/extras/enc/jpegli.cc, which
// stashes the jmp_buf on client_data the same way.
static void ErrorExit(j_common_ptr cinfo) {
  jmp_buf* env = static_cast<jmp_buf*>(cinfo->client_data);
  longjmp(*env, 1);
}

// jpegli is libjpeg's API with the jpeg_* prefix renamed to jpegli_*. The
// libjpeg62 ABI shim that would restore the old names is not built under
// Emscripten (lib/jpegli.cmake skips it), so this calls the jpegli_* entry
// points directly; the compress sequence is otherwise the one in
// codecs/mozjpeg/enc/mozjpeg_enc.cpp, which is example.c's write_JPEG_file
// writing to memory.
val encode(std::string image_in, int image_width, int image_height, JpegliOptions opts) {
  uint8_t* image_buffer = (uint8_t*)image_in.c_str();

  jpeg_compress_struct cinfo;
  jpeg_error_mgr jerr;
  jmp_buf env;
  cinfo.err = jpegli_std_error(&jerr);
  jerr.error_exit = &ErrorExit;
  jpegli_create_compress(&cinfo);
  cinfo.client_data = static_cast<void*>(&env);

  uint8_t* output = nullptr;
  unsigned long size = 0;

  // Nothing between here and the encode owns heap memory except `output`, which
  // is freed on both paths below, so the longjmp cannot leak anything else.
  if (setjmp(env)) {
    jpegli_destroy_compress(&cinfo);
    free(output);
    return val::null();
  }

  jpegli_mem_dest(&cinfo, &output, &size);

  // RGBA in, alpha dropped rather than composited, byte for byte the same
  // treatment mozjpeg's wrapper gives it: jpegli's colour transform reads
  // JCS_EXT_RGBA at a stride of four and ignores the fourth channel. Keeping
  // the two JPEG encoders identical here is what makes their outputs
  // comparable.
  cinfo.image_width = image_width;
  cinfo.image_height = image_height;
  cinfo.input_components = 4;
  cinfo.in_color_space = JCS_EXT_RGBA;
  jpegli_set_defaults(&cinfo);

  // jpegli's own quality->distance mapping, the one cjpegli uses for -q. It is
  // not libjpeg's quality scale, and going around it with jpegli_set_quality
  // would give up the tuned quantization tables that are the reason this codec
  // exists.
  jpegli_set_distance(&cinfo, jpegli_quality_to_distance(opts.quality), TRUE);

  // 0 leaves the sampling factors exactly as jpegli_set_defaults left them
  // (4:2:0 for YCbCr). Writing them unconditionally is how a caller silently
  // opts out of jpegli's defaults, so the "auto" case must not touch them.
  if (opts.chromaSubsample != 0) {
    const int luma_samp_factor = opts.chromaSubsample == 1 ? 1 : 2;
    cinfo.comp_info[0].h_samp_factor = luma_samp_factor;
    cinfo.comp_info[0].v_samp_factor = luma_samp_factor;
    for (int i = 1; i < cinfo.num_components; ++i) {
      cinfo.comp_info[i].h_samp_factor = 1;
      cinfo.comp_info[i].v_samp_factor = 1;
    }
  }

  // No else branch, unlike mozjpeg's wrapper: jpegli has no inherited scan
  // script to clear, and jpegli_set_defaults leaves progressive level 0, which
  // is a single sequential scan.
  if (opts.progressive) {
    jpegli_simple_progression(&cinfo);
  }

  jpegli_start_compress(&cinfo, TRUE);

  int row_stride = image_width * 4;
  while (cinfo.next_scanline < cinfo.image_height) {
    JSAMPROW row_pointer = &image_buffer[cinfo.next_scanline * row_stride];
    (void)jpegli_write_scanlines(&cinfo, &row_pointer, 1);
  }

  jpegli_finish_compress(&cinfo);

  // Resolve the Uint8Array constructor at call time rather than via a
  // namespace-scope `thread_local val::global(...)`: in a large module on emcc
  // 3.1.0 the static-init handle can be created before the JS runtime is ready,
  // yielding an invalid emval handle that throws when `.new_` is used.
  auto js_result = val::global("Uint8Array").new_(typed_memory_view(size, output));

  jpegli_destroy_compress(&cinfo);
  free(output);

  return js_result;
}

EMSCRIPTEN_BINDINGS(my_module) {
  value_object<JpegliOptions>("JpegliOptions")
      .field("quality", &JpegliOptions::quality)
      .field("progressive", &JpegliOptions::progressive)
      .field("chromaSubsample", &JpegliOptions::chromaSubsample);

  function("encode", &encode);
}
