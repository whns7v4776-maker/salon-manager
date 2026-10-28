#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIGHT_PACK="${LIGHT_PACK:-/Users/marzio/Downloads/SalonPro_light_icon_pack}"
DARK_PACK="${DARK_PACK:-/Users/marzio/Downloads/SalonPro_night_icon_pack}"

LIGHT_IOS="$LIGHT_PACK/ios_AppIcon.appiconset"
DARK_IOS="$DARK_PACK/ios_AppIcon.appiconset"
IOS_DEST="$ROOT_DIR/ios/salonmanager/Images.xcassets/AppIcon.appiconset"
ZOOM_PERCENT="${ZOOM_PERCENT:-107}"

copy_required() {
  local source="$1"
  local dest="$2"
  if [[ ! -f "$source" ]]; then
    echo "Missing required icon asset: $source" >&2
    exit 1
  fi
  cp "$source" "$dest"
}

zoom_copy() {
  local source="$1"
  local dest="$2"
  if [[ ! -f "$source" ]]; then
    echo "Missing required icon asset: $source" >&2
    exit 1
  fi

  local dimension
  dimension="$(sips -g pixelWidth "$source" | awk '/pixelWidth/ { print $2 }')"
  if [[ -z "$dimension" ]]; then
    echo "Unable to read icon size: $source" >&2
    exit 1
  fi

  local zoomed_size
  zoomed_size=$(( (dimension * ZOOM_PERCENT + 99) / 100 ))
  local temp_zoomed
  temp_zoomed="$(mktemp /tmp/salonpro-icon-zoom.XXXXXX.png)"

  sips -z "$zoomed_size" "$zoomed_size" "$source" --out "$temp_zoomed" >/dev/null
  sips -c "$dimension" "$dimension" "$temp_zoomed" --out "$dest" >/dev/null
  rm -f "$temp_zoomed"
}

resize_copy() {
  local size="$1"
  local source="$2"
  local dest="$3"
  if [[ ! -f "$source" ]]; then
    echo "Missing required icon asset: $source" >&2
    exit 1
  fi
  sips -z "$size" "$size" "$source" --out "$dest" >/dev/null
}

zoom_copy "$LIGHT_PACK/expo_assets/icon.png" "$ROOT_DIR/assets/icon-light.png"
zoom_copy "$DARK_PACK/expo_assets/icon.png" "$ROOT_DIR/assets/icon-night.png"
zoom_copy "$LIGHT_PACK/expo_assets/splash-icon.png" "$ROOT_DIR/assets/splash-icon.png"
zoom_copy "$DARK_PACK/expo_assets/splash-icon.png" "$ROOT_DIR/assets/splash-icon-dark.png"
zoom_copy "$LIGHT_PACK/expo_assets/adaptive-icon.png" "$ROOT_DIR/assets/adaptive-icon.png"
zoom_copy "$LIGHT_IOS/Icon-1024.png" "$ROOT_DIR/assets/ios-icon-light-no-alpha.png"
zoom_copy "$DARK_IOS/Icon-1024.png" "$ROOT_DIR/assets/ios-icon-dark-no-alpha.png"
copy_required "$LIGHT_PACK/expo_assets/favicon.png" "$ROOT_DIR/assets/images/favicon.png"
zoom_copy "$LIGHT_PACK/expo_assets/icon.png" "$ROOT_DIR/assets/images/icon.png"
zoom_copy "$LIGHT_PACK/expo_assets/splash-icon.png" "$ROOT_DIR/assets/images/splash-icon.png"
zoom_copy "$LIGHT_PACK/expo_assets/icon.png" "$ROOT_DIR/assets/images/android-icon-foreground.png"
zoom_copy "$LIGHT_PACK/expo_assets/icon.png" "$ROOT_DIR/assets/images/android-icon-monochrome.png"

zoom_copy "$LIGHT_IOS/Icon-20@2x.png" "$IOS_DEST/Icon-App-20x20@2x.png"
zoom_copy "$DARK_IOS/Icon-20@2x.png" "$IOS_DEST/Icon-App-20x20@2x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-20@3x.png" "$IOS_DEST/Icon-App-20x20@3x.png"
zoom_copy "$DARK_IOS/Icon-20@3x.png" "$IOS_DEST/Icon-App-20x20@3x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-29@2x.png" "$IOS_DEST/Icon-App-29x29@2x.png"
zoom_copy "$DARK_IOS/Icon-29@2x.png" "$IOS_DEST/Icon-App-29x29@2x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-29@3x.png" "$IOS_DEST/Icon-App-29x29@3x.png"
zoom_copy "$DARK_IOS/Icon-29@3x.png" "$IOS_DEST/Icon-App-29x29@3x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-40@2x.png" "$IOS_DEST/Icon-App-40x40@2x.png"
zoom_copy "$DARK_IOS/Icon-40@2x.png" "$IOS_DEST/Icon-App-40x40@2x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-40@3x.png" "$IOS_DEST/Icon-App-40x40@3x.png"
zoom_copy "$DARK_IOS/Icon-40@3x.png" "$IOS_DEST/Icon-App-40x40@3x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-60@2x.png" "$IOS_DEST/Icon-App-60x60@2x.png"
zoom_copy "$DARK_IOS/Icon-60@2x.png" "$IOS_DEST/Icon-App-60x60@2x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-60@3x.png" "$IOS_DEST/Icon-App-60x60@3x.png"
zoom_copy "$DARK_IOS/Icon-60@3x.png" "$IOS_DEST/Icon-App-60x60@3x-dark.png"
zoom_copy "$LIGHT_IOS/Icon-76.png" "$IOS_DEST/Icon-App-76x76@1x~ipad.png"
zoom_copy "$DARK_IOS/Icon-76.png" "$IOS_DEST/Icon-App-76x76@1x~ipad-dark.png"
zoom_copy "$LIGHT_IOS/Icon-76@2x.png" "$IOS_DEST/Icon-App-76x76@2x~ipad.png"
zoom_copy "$DARK_IOS/Icon-76@2x.png" "$IOS_DEST/Icon-App-76x76@2x~ipad-dark.png"
zoom_copy "$LIGHT_IOS/Icon-83.5@2x.png" "$IOS_DEST/Icon-App-83.5x83.5@2x~ipad.png"
zoom_copy "$DARK_IOS/Icon-83.5@2x.png" "$IOS_DEST/Icon-App-83.5x83.5@2x~ipad-dark.png"
zoom_copy "$LIGHT_IOS/Icon-1024.png" "$IOS_DEST/Icon-App-1024x1024@1x.png"
zoom_copy "$DARK_IOS/Icon-1024.png" "$IOS_DEST/Icon-App-1024x1024@1x-dark.png"

resize_copy 20 "$IOS_DEST/Icon-App-20x20@2x.png" "$IOS_DEST/Icon-App-20x20@1x~ipad.png"
resize_copy 20 "$IOS_DEST/Icon-App-20x20@2x-dark.png" "$IOS_DEST/Icon-App-20x20@1x~ipad-dark.png"
copy_required "$IOS_DEST/Icon-App-20x20@2x.png" "$IOS_DEST/Icon-App-20x20@2x~ipad.png"
copy_required "$IOS_DEST/Icon-App-20x20@2x-dark.png" "$IOS_DEST/Icon-App-20x20@2x~ipad-dark.png"
resize_copy 29 "$IOS_DEST/Icon-App-29x29@2x.png" "$IOS_DEST/Icon-App-29x29@1x~ipad.png"
resize_copy 29 "$IOS_DEST/Icon-App-29x29@2x-dark.png" "$IOS_DEST/Icon-App-29x29@1x~ipad-dark.png"
copy_required "$IOS_DEST/Icon-App-29x29@2x.png" "$IOS_DEST/Icon-App-29x29@2x~ipad.png"
copy_required "$IOS_DEST/Icon-App-29x29@2x-dark.png" "$IOS_DEST/Icon-App-29x29@2x~ipad-dark.png"
resize_copy 40 "$IOS_DEST/Icon-App-40x40@2x.png" "$IOS_DEST/Icon-App-40x40@1x~ipad.png"
resize_copy 40 "$IOS_DEST/Icon-App-40x40@2x-dark.png" "$IOS_DEST/Icon-App-40x40@1x~ipad-dark.png"
copy_required "$IOS_DEST/Icon-App-40x40@2x.png" "$IOS_DEST/Icon-App-40x40@2x~ipad.png"
copy_required "$IOS_DEST/Icon-App-40x40@2x-dark.png" "$IOS_DEST/Icon-App-40x40@2x~ipad-dark.png"

copy_required "$LIGHT_PACK/web_favicons/favicon.ico" "$ROOT_DIR/public/favicon.ico"
copy_required "$LIGHT_PACK/web_favicons/favicon-180.png" "$ROOT_DIR/public/apple-touch-icon.png"
copy_required "$LIGHT_PACK/web_favicons/favicon-180.png" "$ROOT_DIR/public/apple-touch-icon-light.png"
copy_required "$DARK_PACK/web_favicons/favicon-180.png" "$ROOT_DIR/public/apple-touch-icon-dark.png"
copy_required "$LIGHT_PACK/web_favicons/favicon-512.png" "$ROOT_DIR/public/favicon-light.png"
copy_required "$DARK_PACK/web_favicons/favicon-512.png" "$ROOT_DIR/public/favicon-dark.png"
copy_required "$LIGHT_PACK/web_favicons/favicon-512.png" "$ROOT_DIR/public/android-chrome-512-light.png"
copy_required "$DARK_PACK/web_favicons/favicon-512.png" "$ROOT_DIR/public/android-chrome-512-dark.png"
copy_required "$LIGHT_PACK/web_favicons/favicon-192.png" "$ROOT_DIR/public/notification-light.png"
copy_required "$DARK_PACK/web_favicons/favicon-192.png" "$ROOT_DIR/public/notification-dark.png"
