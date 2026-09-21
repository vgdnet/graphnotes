#!/bin/sh
# Compile pinned Wikimedia wikidiff2 src/lib + GraphNotes CLI. No PHP.
set -eu

VERSION="${WIKIDIFF2_VERSION:-1.14.2}"
SHA256="${WIKIDIFF2_SHA256:-97c91a0d4b5b468c533bcd2485fa089612dbcd541773f57f1ffc086942107724}"
URL="${WIKIDIFF2_URL:-https://releases.wikimedia.org/wikidiff2/wikidiff2-${VERSION}.tar.gz}"
DEST="${WIKIDIFF2_DEST:-/usr/local/bin/graphnotes-wikidiff2}"
CACHE="${WIKIDIFF2_CACHE:-${TMPDIR:-/tmp}/wikidiff2-src}"
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
MAIN="${WIKIDIFF2_MAIN:-${ROOT}/wikidiff2/main.cpp}"

mkdir -p "$CACHE" "$(dirname -- "$DEST")"
TARBALL="${CACHE}/wikidiff2-${VERSION}.tar.gz"

if [ ! -f "$TARBALL" ]; then
  curl -fsSL -o "$TARBALL" "$URL"
fi
echo "${SHA256}  ${TARBALL}" | sha256sum -c -

SRC="${CACHE}/wikidiff2-${VERSION}"
rm -rf "$SRC"
tar -xzf "$TARBALL" -C "$CACHE"

# Header-only DiffEngine plus these translation units. Do not compile php_wikidiff2.cpp.
g++ -O2 -std=c++17 -pipe \
  -include cstdint \
  -Wno-write-strings \
  -I "${SRC}/src/lib" \
  -o "$DEST" \
  "$MAIN" \
  "${SRC}/src/lib/Formatter.cpp" \
  "${SRC}/src/lib/LineDiffProcessor.cpp" \
  "${SRC}/src/lib/TableFormatter.cpp" \
  "${SRC}/src/lib/TextUtil.cpp" \
  "${SRC}/src/lib/Wikidiff2.cpp" \
  "${SRC}/src/lib/WordDiffCache.cpp" \
  "${SRC}/src/lib/WordDiffSegmenter.cpp" \
  "${SRC}/src/lib/WordDiffStats.cpp" \
  -lthai

chmod 755 "$DEST"
"$DEST" --version
