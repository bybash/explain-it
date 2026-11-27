#!/bin/sh
# Removes from the image's node_modules what Node never loads there (6.6):
# the image runs the server, the CLI and the voice in Node, and serves the
# web app already built into dist/. Run in the image's final stage, after
# `npm ci --omit=dev`, from /app. The image is checked by rendering an
# example in it (docs/RELEASING.md, "Check it").
set -eu
cd node_modules

# Source maps: nothing debugs inside the image.
find . -name "*.map" -type f -delete

# The voice runs on onnxruntime-node; transformers.js's Node build
# (dist/transformers.node.mjs) imports onnxruntime-node and -common only.
# The browser runtime, and transformers.js's browser builds and WebAssembly,
# are never loaded.
rm -rf onnxruntime-web
rm -f @huggingface/transformers/dist/ort-wasm-* \
  @huggingface/transformers/dist/transformers.js \
  @huggingface/transformers/dist/transformers.min.js \
  @huggingface/transformers/dist/transformers.web.js \
  @huggingface/transformers/dist/transformers.web.min.js
rm -f kokoro-js/dist/kokoro.web.js

# The voice's ONNX runtime ships a build for every system; only this one stays.
napi=onnxruntime-node/bin/napi-v3
find "$napi" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +
find "$napi/linux" -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +

# sharp (which transformers.js imports) ships libvips for glibc and for musl
# (Alpine); the image is Debian, which is glibc.
rm -rf @img/sharp-linuxmusl-* @img/sharp-libvips-linuxmusl-*

# Mermaid, which the server's worker imports for its flowchart parser, loads
# dist/mermaid.core.mjs and its chunks (its export map); the standalone
# bundles and their chunks are for browsers.
rm -rf mermaid/dist/mermaid.js mermaid/dist/mermaid.min.js \
  mermaid/dist/mermaid.esm.mjs mermaid/dist/mermaid.esm.min.mjs \
  mermaid/dist/chunks/mermaid.esm mermaid/dist/chunks/mermaid.esm.min

# Lucide has no export map, so Node loads its CommonJS build (dist/cjs).
rm -rf lucide/dist/esm lucide/dist/umd
