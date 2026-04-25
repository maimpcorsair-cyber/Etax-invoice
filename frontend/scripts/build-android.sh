#!/bin/bash
# Build Android release AAB for Google Play Store
set -e

echo "🤖 Building e-Tax Invoice for Android..."

# 1. Build web
cd "$(dirname "$0")/.."
npm run build

# 2. Sync to native
npx cap sync android

# 3. Build release AAB
cd android
./gradlew bundleRelease

echo ""
echo "✅ Build complete!"
echo "📦 AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "Next steps:"
echo "  1. Upload AAB to Google Play Console"
echo "  2. Fill in store listing (title, description, screenshots)"
echo "  3. Submit for review (~3 days)"
