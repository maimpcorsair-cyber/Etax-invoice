#!/bin/bash
# Generate app icons for Android and iOS from a single source SVG/PNG
# Requires: ImageMagick (brew install imagemagick)
# Usage: ./scripts/generate-icons.sh path/to/icon-1024.png

set -e

SOURCE="${1:-icon-source.png}"
FRONTEND_DIR="$(dirname "$0")/.."

if ! command -v convert &> /dev/null; then
  echo "❌ ImageMagick not found. Install with: brew install imagemagick"
  exit 1
fi

if [ ! -f "$SOURCE" ]; then
  echo "❌ Source icon not found: $SOURCE"
  echo "   Provide a 1024x1024 PNG as the first argument"
  exit 1
fi

echo "🎨 Generating app icons from $SOURCE..."

# ── Android icons ──────────────────────────────────────────────────────────
ANDROID_RES="$FRONTEND_DIR/android/app/src/main/res"

declare -A ANDROID_SIZES=(
  ["mipmap-mdpi"]=48
  ["mipmap-hdpi"]=72
  ["mipmap-xhdpi"]=96
  ["mipmap-xxhdpi"]=144
  ["mipmap-xxxhdpi"]=192
)

for density in "${!ANDROID_SIZES[@]}"; do
  size="${ANDROID_SIZES[$density]}"
  mkdir -p "$ANDROID_RES/$density"
  convert "$SOURCE" -resize "${size}x${size}" "$ANDROID_RES/$density/ic_launcher.png"
  convert "$SOURCE" -resize "${size}x${size}" "$ANDROID_RES/$density/ic_launcher_round.png"
  echo "  ✓ Android $density (${size}px)"
done

# ── iOS icons ──────────────────────────────────────────────────────────────
IOS_ASSETS="$FRONTEND_DIR/ios/App/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$IOS_ASSETS"

declare -A IOS_SIZES=(
  [20]=1 [20]=2 [20]=3
  [29]=1 [29]=2 [29]=3
  [40]=1 [40]=2 [40]=3
  [60]=2 [60]=3
  [76]=1 [76]=2
  [83.5]=2
  [1024]=1
)

for size in 20 29 40 57 60 76 83 1024; do
  for scale in 1 2 3; do
    px=$((size * scale))
    filename="Icon-${size}@${scale}x.png"
    convert "$SOURCE" -resize "${px}x${px}" "$IOS_ASSETS/$filename"
  done
done
convert "$SOURCE" -resize "1024x1024" "$IOS_ASSETS/Icon-1024@1x.png"
echo "  ✓ iOS icons generated"

echo ""
echo "✅ Icons generated! Run 'npx cap sync' to copy to native projects."
