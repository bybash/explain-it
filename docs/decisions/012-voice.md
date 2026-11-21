# 012: Voice with Kokoro

## Context

Slice 2.1 adds narration. SPEC chose kokoro-js (decision 001) and a cache
of lines by hash, but left open where the model lives, what the hash
covers, when lines are made before the Preview gate exists, and how the
dependencies' licences fit an MIT project.

## Decision

- **The model lives in the app's cache.** Kokoro-82M (q8) downloads on
  first use into `cache/models/` (`CACHE_DIR`, `./cache` by default), the
  folder SPEC's Docker command mounts. kokoro-js and transformers.js load
  with the first line, not with the app.
- **A line's key is everything that changes how it sounds:** the model and
  its precision, the kokoro-js version (its voices ship in the package),
  the voice, the speed and the text. Lines are 16-bit mono WAV at 24 kHz in
  `projects/<slug>/cache/tts/<key>.wav`, written whole and then renamed.
- **The voice is one of the 28 Kokoro voices.** `config.voice.id` is an
  enum, so a wrong id is named with the list when the file is read, rather
  than failing during generation. A project with an unknown id no longer
  loads until it is fixed, even with the voice off.
- **`check` generates the voice** until the Preview gate (3.8) does it with
  progress. It reports the voice as off, ready (lines, generated, cached,
  seconds) or failed with the reason. `ready` still means "can render": the
  video renders without the voice until 2.4 mixes it in.
- **Licences.** kokoro-js and transformers.js are Apache-2.0 and
  onnxruntime-node is MIT. Two transitive parts are not permissive:
  - `phonemizer`, which kokoro-js uses to turn text into phonemes, bundles
    eSpeak NG compiled to WebAssembly. eSpeak NG is GPL-3.0-or-later,
    although the package says Apache-2.0.
  - `sharp`, which transformers.js imports for images, ships libvips
    binaries under LGPL-3.0-or-later. explAIn-it never uses it.

  They are accepted and run in the app's process. explAIn-it's own code
  stays MIT; npm installs these packages, nothing is copied into this
  repository. Anyone who distributes a build that includes them, such as
  the Docker image (6.1), must meet the GPL for eSpeak NG and the LGPL for
  libvips: say so, and point at their source.
- **`sharp` is raised to 0.35.5** with an npm override: transformers.js
  3.x asks for 0.34, which has known advisories in libvips and its image
  decoders.

## Alternatives

- **Speak in a separate process,** so eSpeak NG never loads into the MIT
  app. Cleaner for licensing and isolates crashes; more work. Revisit
  before the Docker image is published.
- **Another TTS without eSpeak NG.** Most open neural voices use it for
  phonemes; the rest are cloud services or hand-written English rules.
- **The model in the user's home cache,** shared by every checkout. It
  would need a different Docker mount than SPEC shows.
- **Lines keyed by text, voice and speed only,** as SPEC first said. A new
  model or kokoro-js release would then replay stale audio.
