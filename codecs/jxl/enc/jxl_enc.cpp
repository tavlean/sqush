#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <jxl/codestream_header.h>
#include <jxl/color_encoding.h>
#include <jxl/encode.h>
#include <jxl/encode_cxx.h>
#include <jxl/types.h>

#ifdef __EMSCRIPTEN_PTHREADS__
#include <jxl/thread_parallel_runner.h>
#include <jxl/thread_parallel_runner_cxx.h>
#endif

#include <cmath>
#include <cstdint>
#include <vector>

using namespace emscripten;

struct JXLOptions {
  int effort;
  float quality;
  bool progressive;
  int epf;
  bool lossyPalette;
  size_t decodingSpeedTier;
  float photonNoiseIso;
  bool lossyModular;
};

// libjxl v0.9 deleted the internal C++ encoder API this wrapper used to call
// (enc_file.h / enc_color_management.h / EncodeFile / GetJxlCms), so from
// v0.12.0 the body is written against the public JxlEncoder* C API, modelled on
// examples/encode_oneshot.cc in the libjxl tree. Only the option *mappings* and
// the quality->distance math survive from the old body; each mapping below is
// the same cparams field the old code wrote, reached through the public setter
// that libjxl's own cjxl tool uses for the equivalent flag.

// Quality settings roughly match libjpeg qualities. libjxl drives BOTH VarDCT
// and modular modes from butteraugli_distance (lower = better quality);
// quality == 100 -> distance 0 == lossless. Ported unchanged from the v0.8.5
// wrapper: this is product behaviour, not an implementation detail.
//
// The only addition is the upper clamp. The old wrapper wrote
// cparams.butteraugli_distance directly and was unbounded (quality 0 mapped to
// ~45.5); JxlEncoderSetFrameDistance rejects anything above 25.0 and would turn
// the bottom of the quality slider into an encode failure. Clamping keeps the
// mapping identical everywhere it is expressible and keeps quality 0-4 working.
static float QualityToDistance(float quality) {
  if (quality >= 100) {
    return 0.0f;
  }
  float distance;
  if (quality >= 30) {
    distance = 0.1 + (100 - quality) * 0.09;
  } else {
    distance = 6.4 + pow(2.5, (30 - quality) / 5.0f) / 6.25f;
  }
  return distance > 25.0f ? 25.0f : distance;
}

val encode(std::string image, int width, int height, JXLOptions options) {
  const float distance = QualityToDistance(options.quality);
  const bool lossless = (distance == 0.0f);

  // Declared before the encoder so it outlives it: unique_ptr members are
  // destroyed in reverse declaration order, which destroys the encoder first
  // and only then the runner it points at.
#ifdef __EMSCRIPTEN_PTHREADS__
  JxlThreadParallelRunnerPtr runner = JxlThreadParallelRunnerMake(
      nullptr, JxlThreadParallelRunnerDefaultNumWorkerThreads());
  if (!runner) {
    return val::null();
  }
#endif

  JxlEncoderPtr enc = JxlEncoderMake(nullptr);
  if (!enc) {
    return val::null();
  }

  // Single-threaded variants are built without -pthread and link no
  // libjxl_threads.a, so they must not touch the runner API at all; libjxl then
  // runs its own sequential runner.
#ifdef __EMSCRIPTEN_PTHREADS__
  if (JXL_ENC_SUCCESS != JxlEncoderSetParallelRunner(enc.get(), JxlThreadParallelRunner,
                                                     runner.get())) {
    return val::null();
  }
#endif

  JxlBasicInfo info;
  JxlEncoderInitBasicInfo(&info);
  info.xsize = width;
  info.ysize = height;
  info.num_color_channels = 3;
  info.num_extra_channels = 1;
  info.alpha_bits = 8;
  info.bits_per_sample = 8;
  // Lossless requires the original (non-XYB) profile; leaving this false makes
  // JxlEncoderSetFrameLossless fail and would silently downgrade lossless.
  info.uses_original_profile = lossless ? JXL_TRUE : JXL_FALSE;
  if (JXL_ENC_SUCCESS != JxlEncoderSetBasicInfo(enc.get(), &info)) {
    return val::null();
  }

  JxlColorEncoding color_encoding;
  JxlColorEncodingSetToSRGB(&color_encoding, /*is_gray=*/JXL_FALSE);
  if (JXL_ENC_SUCCESS != JxlEncoderSetColorEncoding(enc.get(), &color_encoding)) {
    return val::null();
  }

  JxlEncoderFrameSettings* frame_settings = JxlEncoderFrameSettingsCreate(enc.get(), nullptr);
  if (!frame_settings) {
    return val::null();
  }

  // effort -> cparams.speed_tier: the public setter applies the same
  // SpeedTier(10 - effort) the old wrapper computed by hand.
  if (JXL_ENC_SUCCESS !=
      JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_EFFORT,
                                       options.effort)) {
    return val::null();
  }
  if (JXL_ENC_SUCCESS !=
      JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_EPF, options.epf)) {
    return val::null();
  }
  if (JXL_ENC_SUCCESS !=
      JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_DECODING_SPEED,
                                       options.decodingSpeedTier)) {
    return val::null();
  }
  if (JXL_ENC_SUCCESS !=
      JxlEncoderFrameSettingsSetFloatOption(frame_settings, JXL_ENC_FRAME_SETTING_PHOTON_NOISE,
                                            options.photonNoiseIso)) {
    return val::null();
  }
  // Not an option the app exposes: it pins the encoder to the whole-image mode
  // v0.8.5 always used. v0.11 added a streaming mode that libjxl turns on by
  // default (buffering = -1) once a frame has more than 8 groups, trading
  // compression for peak memory. Measured on tests/fixtures/screenshot.png at
  // the default quality, letting it stream costs 28702 bytes against 14064 with
  // streaming off. Frisp already held whole images in memory at v0.8.5, so this
  // keeps the behaviour it had rather than adopting a new mode.
  if (JXL_ENC_SUCCESS !=
      JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_BUFFERING, 0)) {
    return val::null();
  }

  if (options.lossyPalette) {
    // Near-lossless palette assumes -R 0 and the Zero predictor, as before. The
    // modular_mode this block used to set is immediately overwritten by the
    // MODULAR write below, exactly as in the v0.8.5 wrapper.
    if (JXL_ENC_SUCCESS !=
            JxlEncoderFrameSettingsSetOption(frame_settings,
                                             JXL_ENC_FRAME_SETTING_LOSSY_PALETTE, 1) ||
        JXL_ENC_SUCCESS != JxlEncoderFrameSettingsSetOption(
                               frame_settings, JXL_ENC_FRAME_SETTING_PALETTE_COLORS, 0) ||
        JXL_ENC_SUCCESS !=
            JxlEncoderFrameSettingsSetOption(frame_settings,
                                             JXL_ENC_FRAME_SETTING_MODULAR_PREDICTOR,
                                             /*jxl::Predictor::Zero=*/0) ||
        JXL_ENC_SUCCESS !=
            JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_RESPONSIVE, 0)) {
      return val::null();
    }
  }

  const bool modular = (options.lossyModular || lossless);
  if (JXL_ENC_SUCCESS != JxlEncoderFrameSettingsSetOption(
                             frame_settings, JXL_ENC_FRAME_SETTING_MODULAR, modular ? 1 : 0)) {
    return val::null();
  }

  if (options.progressive) {
    if (JXL_ENC_SUCCESS !=
            JxlEncoderFrameSettingsSetOption(frame_settings,
                                             JXL_ENC_FRAME_SETTING_QPROGRESSIVE_AC, 1) ||
        JXL_ENC_SUCCESS !=
            JxlEncoderFrameSettingsSetOption(frame_settings, JXL_ENC_FRAME_SETTING_RESPONSIVE, 1)) {
      return val::null();
    }
    if (!modular && JXL_ENC_SUCCESS !=
                        JxlEncoderFrameSettingsSetOption(
                            frame_settings, JXL_ENC_FRAME_SETTING_PROGRESSIVE_DC, 1)) {
      return val::null();
    }
  }

  if (modular) {
    // Lossless modular keeps exact RGB (kNone); lossy uses XYB. jxl::ColorTransform
    // is kXYB = 0, kNone = 1, and JXL_ENC_FRAME_SETTING_COLOR_TRANSFORM takes the
    // enum value directly.
    if (JXL_ENC_SUCCESS != JxlEncoderFrameSettingsSetOption(
                               frame_settings, JXL_ENC_FRAME_SETTING_COLOR_TRANSFORM,
                               lossless ? 1 : 0)) {
      return val::null();
    }
  }

  if (lossless) {
    if (JXL_ENC_SUCCESS != JxlEncoderSetFrameLossless(frame_settings, JXL_TRUE)) {
      return val::null();
    }
  } else if (JXL_ENC_SUCCESS != JxlEncoderSetFrameDistance(frame_settings, distance)) {
    return val::null();
  }

  // 4 channels = RGBA (alpha comes from the alpha_bits above); UINT8
  // little-endian matches the input buffer.
  JxlPixelFormat format = {/*num_channels=*/4, /*data_type=*/JXL_TYPE_UINT8,
                           /*endianness=*/JXL_LITTLE_ENDIAN, /*align=*/0};
  if (JXL_ENC_SUCCESS != JxlEncoderAddImageFrame(frame_settings, &format,
                                                 static_cast<const void*>(image.data()),
                                                 image.size())) {
    return val::null();
  }
  // Without this the ProcessOutput loop never reaches JXL_ENC_SUCCESS and the
  // encode hangs.
  JxlEncoderCloseInput(enc.get());

  std::vector<uint8_t> compressed(64);
  uint8_t* next_out = compressed.data();
  size_t avail_out = compressed.size();
  JxlEncoderStatus process_result = JXL_ENC_NEED_MORE_OUTPUT;
  while (process_result == JXL_ENC_NEED_MORE_OUTPUT) {
    process_result = JxlEncoderProcessOutput(enc.get(), &next_out, &avail_out);
    if (process_result == JXL_ENC_NEED_MORE_OUTPUT) {
      size_t offset = next_out - compressed.data();
      compressed.resize(compressed.size() * 2);
      next_out = compressed.data() + offset;
      avail_out = compressed.size() - offset;
    }
  }
  if (JXL_ENC_SUCCESS != process_result) {
    return val::null();
  }
  compressed.resize(next_out - compressed.data());

  // Resolve the Uint8Array constructor at call time rather than via a
  // namespace-scope `thread_local val::global(...)`: in this large module on
  // emcc 3.1.0 the static-init handle can be created before the JS runtime is
  // ready, yielding an invalid emval handle that throws when `.new_` is used.
  return val::global("Uint8Array").new_(typed_memory_view(compressed.size(), compressed.data()));
}

EMSCRIPTEN_BINDINGS(my_module) {
  value_object<JXLOptions>("JXLOptions")
      .field("effort", &JXLOptions::effort)
      .field("quality", &JXLOptions::quality)
      .field("progressive", &JXLOptions::progressive)
      .field("lossyPalette", &JXLOptions::lossyPalette)
      .field("decodingSpeedTier", &JXLOptions::decodingSpeedTier)
      .field("photonNoiseIso", &JXLOptions::photonNoiseIso)
      .field("lossyModular", &JXLOptions::lossyModular)
      .field("epf", &JXLOptions::epf);

  function("encode", &encode);
}
