# explAIn-it in one image: the app, the CLI, Chromium and ffmpeg (SPEC, Docker).
# The voice model is not in it: the voice downloads it into /app/cache on first use.
# How to run it: README, "Or run it with Docker". Licences: NOTICE.md.

# Node with Chromium, ffmpeg and tini, shared by the tests and the app, and
# installed before any source is copied, so a change to the code keeps the
# same browser (the golden stills are drawn with it; decision 046). Chromium
# renders, ffmpeg encodes and measures loudness, and tini passes on signals
# and reaps the Chrome processes a render leaves behind.
FROM node:24-bookworm-slim AS browser
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium

# The web app and the render page, built with the dev dependencies (Vite).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:engine

# The tests that need Chromium and ffmpeg, as CI runs them (6.3): the golden
# stills, the renders and the checks, in the image's own browser.
FROM browser AS test
WORKDIR /app
COPY --from=build /app /app

FROM browser
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY scripts/prune-image.sh /tmp/prune-image.sh
# Without Vite, a render uses the page built above (src/render/page.ts). What
# Node never loads in the image goes: source maps, browser builds, other
# systems' binaries (scripts/prune-image.sh says which, and why).
RUN npm ci --omit=dev && npm cache clean --force \
  && sh /tmp/prune-image.sh && rm /tmp/prune-image.sh
COPY --from=build /app/dist ./dist
COPY src ./src
COPY assets ./assets
COPY examples ./examples
COPY LICENSE NOTICE.md ./
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
  ENV_FILE=/app/config/.env
USER node
EXPOSE 3000
VOLUME ["/app/projects", "/app/cache", "/app/config"]
LABEL org.opencontainers.image.source="https://github.com/bybash/explain-it" \
  org.opencontainers.image.description="Turn any flow into an isometric explainer video." \
  org.opencontainers.image.licenses="MIT AND GPL-3.0-or-later AND LGPL-3.0-or-later AND GPL-2.0-or-later"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server/main.ts"]
