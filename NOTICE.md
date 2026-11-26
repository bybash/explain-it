# Notices

explAIn-it is MIT licensed (see `LICENSE`). The videos people make are
theirs.

The Docker image carries other software under its own licences. Most is
permissive (MIT, Apache-2.0, ISC, BSD, OFL); its licence file is in the
image next to it, under `/app/node_modules/<package>/` for npm packages and
`/usr/share/doc/<package>/copyright` for Debian packages. These parts are
not permissive (SPEC, Licences; decision 012):

| Part | Licence | Where it is | Source |
|---|---|---|---|
| eSpeak NG, inside kokoro-js's `phonemizer` | GPL-3.0-or-later | `/app/node_modules/phonemizer/` | <https://github.com/espeak-ng/espeak-ng>, built by <https://github.com/xenova/phonemizer> |
| libvips, inside `sharp` | LGPL-3.0-or-later | `/app/node_modules/@img/sharp-libvips-*/` | <https://github.com/lovell/sharp-libvips> |
| FFmpeg, run as a separate program | GPL-2.0-or-later (Debian's build) | `/usr/bin/ffmpeg` | Debian's `ffmpeg` source package |
| Chromium, run as a separate program | BSD-3-Clause and others | `/usr/lib/chromium/` | Debian's `chromium` source package |

The Debian packages' exact versions are listed by
`docker run --rm --entrypoint dpkg ghcr.io/bybash/explain-it -l`; their
sources are at <https://snapshot.debian.org>. Nothing in the image changes
any of these parts.
