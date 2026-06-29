#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Building App Bundle for Google Play Store...${NC}"

# Validate environment
if [ -z "$KEYSTORE_PASSWORD" ]; then
  echo -e "${RED}❌ Error: KEYSTORE_PASSWORD not set${NC}"
  exit 1
fi

if [ -z "$KEY_ALIAS" ]; then
  echo -e "${RED}❌ Error: KEY_ALIAS not set${NC}"
  exit 1
fi

if [ -z "$KEY_PASSWORD" ]; then
  echo -e "${RED}❌ Error: KEY_PASSWORD not set${NC}"
  exit 1
fi

# Check for keystore file
if [ ! -f "android/app/paybot-release-key.keystore" ]; then
  echo -e "${RED}❌ Error: Keystore file not found${NC}"
  exit 1
fi

cd android

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
./gradlew clean

# Build App Bundle (recommended for Play Store)
echo -e "${YELLOW}📦 Building App Bundle...${NC}"
./gradlew bundleRelease \
  -PMYAPP_RELEASE_STORE_PASSWORD="${KEYSTORE_PASSWORD}" \
  -PMYAPP_RELEASE_KEY_PASSWORD="${KEY_PASSWORD}" \
  -PMYAPP_RELEASE_KEY_ALIAS="${KEY_ALIAS}" || {
  echo -e "${RED}❌ Bundle build failed${NC}"
  exit 1
}

BUNDLE_PATH="./app/build/outputs/bundle/release/app-release.aab"

if [ -f "$BUNDLE_PATH" ]; then
  BUNDLE_SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)
  echo -e "${GREEN}✅ App Bundle created successfully!${NC}"
  echo -e "${GREEN}📍 Location: $(pwd)/$BUNDLE_PATH${NC}"
  echo -e "${GREEN}📊 Size: ${BUNDLE_SIZE}${NC}"
  echo ""
  echo -e "${YELLOW}📤 Next steps to upload to Google Play Console:${NC}"
  echo "  1. Go to https://play.google.com/console"
  echo "  2. Select your app (PayBot)"
  echo "  3. Go to Release → Production"
  echo "  4. Click Create Release"
  echo "  5. Upload the AAB file: $BUNDLE_PATH"
  echo "  6. Review and publish"
  echo ""
  echo -e "${YELLOW}🧪 To test locally with bundletool:${NC}"
  echo "  1. Download bundletool: https://developer.android.com/studio/command-line/bundletool"
  echo "  2. bundletool build-apks --bundle=$BUNDLE_PATH --output=app.apks --mode=universal"
  echo "  3. bundletool install-apks --apks=app.apks"
  
  cd ..
  exit 0
else
  echo -e "${RED}❌ Bundle build failed${NC}"
  cd ..
  exit 1
fi