#!/usr/bin/env bash
# Builds dist/commkit/ (and dist/commkit.zip): everything another project needs to use CommKit offline.
# Copy the folder's contents into the root of your web project or your Android app's assets.
#   npm run kit
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/commkit
rm -rf "$OUT" dist/commkit.zip
mkdir -p "$OUT"/{kit/examples,lib,js,models,samples/kit}

cp public/kit/commkit.js public/kit/index.html public/kit/README.md "$OUT/kit/"
cp public/kit/examples/*.html "$OUT/kit/examples/"
cp public/lib/vosk.js "$OUT/lib/"
cp public/js/scoring.js public/js/answer-scoring.js "$OUT/js/"
cp public/models/en-in.tar.gz "$OUT/models/"
cp public/commkit-sw.js "$OUT/"
# recordings used by the demo page and the example games ("Try a sample")
cp public/samples/kit/*.wav "$OUT/samples/kit/"
cp public/samples/p1-skipped.wav public/samples/s-weekend.wav "$OUT/samples/"

# the demo page links back to the course; point it at the kit's own pages instead
sed -i.bak 's#<a href="../plan.html">Course</a>##' "$OUT/kit/index.html" && rm "$OUT/kit/index.html.bak"

(cd dist && zip -qr commkit.zip commkit)
echo "Built $OUT ($(du -sh "$OUT" | cut -f1)) and dist/commkit.zip ($(du -sh dist/commkit.zip | cut -f1))"
