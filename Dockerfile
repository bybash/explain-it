# explAIn-it in one image: the app, the CLI, Chromium and ffmpeg (SPEC, Docker).
# The voice model is not in it: the voice downloads it into /app/cache on first use.
#
#   docker build -t explain-it .
#   docker run -p 127.0.0.1:3000:3000 -v ./projects:/app/projects -v ./cache:/app/cache \
#     -e OPENROUTER_API_KEY=... explain-it

# The web app and the render page, built with the dev dependencies (Vite).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:engine

FROM node:24-bookworm-slim
# Chromium renders, ffmpeg encodes and measures loudness, and tini passes on
# signals and reaps the Chrome processes a render leaves behind.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Without Vite, a render uses the page built above (src/render/page.ts). The
# voice's ONNX runtime ships a build for every system; only this one stays.
RUN npm ci --omit=dev && npm cache clean --force \
  && cd node_modules/onnxruntime-node/bin/napi-v3 \
  && find . -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + \
  && find linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +
COPY --from=build /app/dist ./dist
COPY src ./src
COPY assets ./assets
COPY examples ./examples
RUN ln -s /app/src/cli/main.ts /usr/local/bin/explain-it \
  && mkdir projects cache config \
  && chown node:node projects cache config
# Listens on every interface inside the container; `docker run -p 127.0.0.1:…`
# keeps it on this machine. A key saved in the settings page goes to its own
# volume, never beside the projects.
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  PROJECTS_DIR=/app/projects \
  CACHE_DIR=/app/cache \
  ENV_FILE=/app/config/.env \
  CHROME_PATH=/usr/bin/chromium
USER node
EXPOSE 3000
VOLUME ["/app/projects", "/app/cache", "/app/config"]
LABEL org.opencontainers.image.source="https://github.com/bybash/explain-it" \
  org.opencontainers.image.description="Turn any flow into an isometric explainer video." \
  org.opencontainers.image.licenses="MIT"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server/main.ts"]
