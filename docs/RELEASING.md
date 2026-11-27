# Releasing

What a maintainer does to publish a release. Each step is done by hand
once; the image is built and published by CI from the tag.

1. **Check the licences** of what the image carries (`NOTICE.md`): eSpeak
   NG (GPL-3.0-or-later) and libvips (LGPL-3.0-or-later) in the voice's
   packages, and Debian's ffmpeg and Chromium. Decide whether naming their
   upstream and Debian sources is enough, or whether the release offers the
   sources in writing or ships them, and say so in `NOTICE.md`.
2. **Upload the demo video to GitHub** (drag `docs/clips/6.4-demo-checkout.mp4`
   into an issue or PR comment) and put the `user-attachments` link it gives
   on its own line under the README's still, so the README plays it inline.
3. **Merge** the release PR into `main`, with the version in
   `package.json`, `package-lock.json` and `src/version.ts`, and its
   section in `CHANGELOG.md`.
4. **Tag** `main` and push the tag: `git tag v0.1.0 && git push origin v0.1.0`.
   The Docker workflow builds the image for amd64 and arm64 and publishes
   `ghcr.io/bybash/explain-it:0.1.0`, `:0.1` and `:latest`.
5. **Make the package public**, once, after its first publish: GitHub,
   your profile, Packages, `explain-it`, Package settings, Change
   visibility.
6. **Write the GitHub release** from the tag, with the changelog's section
   as its notes.
7. **Check it**: `docker run -p 127.0.0.1:3000:3000 ghcr.io/bybash/explain-it:0.1.0`
   on a machine without the repository, and open <http://127.0.0.1:3000>.
