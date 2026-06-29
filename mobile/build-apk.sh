#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔨 Building xend Android APK...${NC}"

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
  echo -e "${RED}❌ Error: Keystore file not found at android/app/paybot-release-key.keystore${NC}"
  echo -e "${YELLOW}Generate keystore with:${NC}"
  echo "  keytool -genkey -v -keystore android/app/paybot-release-key.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias ${KEY_ALIAS}"
  exit 1
fi

# Navigate to Android directory
echo -e "${YELLOW}📂 Navigating to android directory...${NC}"
cd android

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
./gradlew clean || {
  echo -e "${RED}❌ Gradle clean failed${NC}"
  exit 1
}

# Build release APK
echo -e "${YELLOW}📦 Building release APK...${NC}"
./gradlew assembleRelease \
  -PMYAPP_RELEASE_STORE_PASSWORD="${KEYSTORE_PASSWORD}" \
  -PMYAPP_RELEASE_KEY_PASSWORD="${KEY_PASSWORD}" \
  -PMYAPP_RELEASE_KEY_ALIAS="${KEY_ALIAS}" || {
  echo -e "${RED}❌ Gradle assembleRelease failed${NC}"
  exit 1
}

# Output location
APK_PATH="./app/build/outputs/apk/release/app-release.apk"
APK_SIZE=$(du -h "$APK_PATH" | cut -f1)

if [ -f "$APK_PATH" ]; then
  echo -e "${GREEN}✅ APK built successfully!${NC}"
  echo -e "${GREEN}📍 Location: $(pwd)/$APK_PATH${NC}"
  echo -e "${GREEN}📊 Size: ${APK_SIZE}${NC}"
  
  # Also build debug APK for testing
  echo -e "${YELLOW}📦 Building debug APK for testing...${NC}"
  ./gradlew assembleDebug || echo -e "${YELLOW}⚠️  Debug APK build skipped${NC}"
  
  if [ -f "./app/build/outputs/apk/debug/app-debug.apk" ]; then
    DEBUG_SIZE=$(du -h "./app/build/outputs/apk/debug/app-debug.apk" | cut -f1)
    echo -e "${GREEN}📍 Debug APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk${NC}"
    echo -e "${GREEN}📊 Debug Size: ${DEBUG_SIZE}${NC}"
  fi
  
  cd ..
  exit 0
else
  echo -e "${RED}❌ APK build failed${NC}"
  cd ..
  exit 1
fi