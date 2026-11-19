#!/bin/bash
# Build the two-phone picture for the landing page from two real screenshots.
#
# Usage: scripts/make-phone-mockup.sh [screen-1.png] [screen-2.png]
#   Defaults to screens/1.png and screens/2.png.
# Output: site/images/app-screens.png (shown on the page when it exists)
#
# Take the screenshots on a phone (portrait, for example the map with a few
# features on it) and copy them into screens/. Any aspect ratio works: they are
# scaled and cropped to a modern phone screen. Needs ImageMagick.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ONE="${1:-$ROOT/screens/1.png}"
TWO="${2:-$ROOT/screens/2.png}"
OUT="$ROOT/site/images/app-screens.png"

for f in "$ONE" "$TWO"; do [ -f "$f" ] || { echo "Error: $f not found"; exit 1; }; done
command -v convert >/dev/null || { echo "Error: ImageMagick (convert) not found"; exit 1; }

W=300            # screen width of each phone
H=650            # screen height (about 9:19.5)
BEZEL=11
SCREEN_R=34
PHONE_R=$((SCREEN_R + BEZEL))
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# phone <screenshot> <out.png>: the screenshot cropped to the screen, inside a rounded black body
phone() {
    local shot="$1" out="$2"
    local pw=$((W + 2 * BEZEL)) ph=$((H + 2 * BEZEL))

    # Screen: fill the area, crop the overflow, round the corners
    convert "$shot" -resize "${W}x${H}^" -gravity center -extent "${W}x${H}" +repage "$TMP/screen.png"
    convert -size "${W}x${H}" xc:none -fill white \
        -draw "roundrectangle 0,0 $((W - 1)),$((H - 1)) $SCREEN_R,$SCREEN_R" "$TMP/screen-mask.png"
    convert "$TMP/screen.png" "$TMP/screen-mask.png" -alpha off -compose CopyOpacity -composite "$TMP/screen-round.png"

    # Body, with a thin lighter edge so it reads on a white page
    convert -size "${pw}x${ph}" xc:none \
        -fill '#1d1d1f' -stroke '#6b6b70' -strokewidth 2 \
        -draw "roundrectangle 1,1 $((pw - 2)),$((ph - 2)) $PHONE_R,$PHONE_R" \
        "$TMP/screen-round.png" -geometry "+${BEZEL}+${BEZEL}" -composite "$out"
}

phone "$ONE" "$TMP/p1.png"
phone "$TWO" "$TMP/p2.png"

PW=$((W + 2 * BEZEL))
PH=$((H + 2 * BEZEL))
DX=$((PW - 40))      # the second phone overlaps the first
DY=50                # and sits lower
CW=$((PW + DX + 60))
CH=$((PH + DY + 50))

# Soft shadow under each phone, then the two phones on a transparent canvas
shadow() { convert "$1" \( +clone -background black -shadow 45x14+0+10 \) +swap -background none -layers merge +repage "$2"; }
shadow "$TMP/p1.png" "$TMP/s1.png"
shadow "$TMP/p2.png" "$TMP/s2.png"

mkdir -p "$(dirname "$OUT")"
convert -size "${CW}x${CH}" xc:none \
    "$TMP/s1.png" -geometry "+10+0" -composite \
    "$TMP/s2.png" -geometry "+$((10 + DX))+${DY}" -composite \
    -trim +repage -strip "$OUT"

echo "Wrote $OUT ($(identify -format '%wx%h' "$OUT"))"
