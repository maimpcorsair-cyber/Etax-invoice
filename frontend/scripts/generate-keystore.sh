#!/bin/bash
# Generate Android release keystore for e-Tax Invoice
# Run this ONCE and store the keystore + passwords securely
# Never commit the .keystore / .jks file to git!

set -e

KEYSTORE_DIR="$(dirname "$0")/../android/app/keystore"
KEYSTORE_FILE="$KEYSTORE_DIR/etax-release.keystore"

echo "🔑 Generating Android release keystore..."
echo ""
echo "⚠️  IMPORTANT: Save the passwords you enter. Losing them means you"
echo "   cannot update your app on Google Play Store."
echo ""

mkdir -p "$KEYSTORE_DIR"

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias etax-invoice \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=e-Tax Invoice, OU=Engineering, O=SiamTech, L=Bangkok, ST=Bangkok, C=TH"

echo ""
echo "✅ Keystore created at: $KEYSTORE_FILE"
echo ""
echo "📋 Set these environment variables before building:"
echo "   export KEYSTORE_PATH=$(realpath $KEYSTORE_FILE)"
echo "   export KEYSTORE_PASSWORD=<your-store-password>"
echo "   export KEY_ALIAS=etax-invoice"
echo "   export KEY_PASSWORD=<your-key-password>"
echo ""
echo "   Or add them to .env.local (never commit to git!)"

# Get SHA-1 for Google Sign-In registration
echo ""
echo "🔐 SHA-1 fingerprint (needed for Google Sign-In):"
keytool -list -v \
  -keystore "$KEYSTORE_FILE" \
  -alias etax-invoice \
  2>/dev/null | grep "SHA1:"
echo ""
echo "👉 Add this SHA-1 to Google Cloud Console:"
echo "   https://console.cloud.google.com → APIs & Services → Credentials"
echo "   → Your OAuth 2.0 Client → Add fingerprint"
