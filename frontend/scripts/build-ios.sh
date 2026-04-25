#!/bin/bash
# Build iOS archive for App Store submission
set -e

echo "🍎 Building e-Tax Invoice for iOS..."

# 1. Build web
cd "$(dirname "$0")/.."
npm run build

# 2. Sync to native
npx cap sync ios

# 3. Open Xcode for Archive
echo ""
echo "Opening Xcode..."
npx cap open ios

echo ""
echo "📋 In Xcode:"
echo "  1. Select 'Any iOS Device (arm64)' as target"
echo "  2. Product → Archive"
echo "  3. Distribute App → App Store Connect"
echo "  4. Upload"
