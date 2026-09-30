SKIPUNZIP=1

MODULE_ID=@MODULE_ID@

TMP_MODULE_DIR=/data/local/tmp/libsec

if [ "$ARCH" != "arm" ] && [ "$ARCH" != "arm64" ] && [ "$ARCH" != "x86" ] && [ "$ARCH" != "x64" ]; then
  abort "! Unsupported platform: $ARCH"
else
  ui_print "- Device platform: $ARCH"
fi

ui_print "- Extracting verify.sh"
unzip -o "$ZIPFILE" 'verify.sh' -d "$TMPDIR" >&2
if [ ! -f "$TMPDIR/verify.sh" ]; then
  ui_print    "*********************************************************"
  ui_print    "! Unable to extract verify.sh!"
  ui_print    "! This zip may be corrupted, please try downloading again"
  abort "*********************************************************"
fi
. $TMPDIR/verify.sh

ui_print "- Extracting module files"
extract "$ZIPFILE" 'module.prop' "$MODPATH"
extract "$ZIPFILE" 'uninstall.sh' "$MODPATH"

mkdir -p "$MODPATH/webroot/assets"
extract "$ZIPFILE" 'webroot/index.html' "$MODPATH/webroot" true
extract "$ZIPFILE" 'webroot/assets/app.js' "$MODPATH/webroot/assets" true
extract "$ZIPFILE" 'webroot/assets/app.css' "$MODPATH/webroot/assets" true

LIB32_NAME="armeabi-v7a.so"
LIB64_NAME="arm64-v8a.so"
LIB32_DEST="$MODPATH/zygisk"
LIB64_DEST="$MODPATH/zygisk"

[ "$ARCH" = "x86" ] || [ "$ARCH" = "x64" ] && LIB32_NAME="x86.so"
[ "$ARCH" = "x86" ] || [ "$ARCH" = "x64" ] && LIB64_NAME="x86_64.so"

mkdir -p "$LIB32_DEST"
mkdir -p "$LIB64_DEST"

ui_print "- Extracting 32-bit libraries"
extract "$ZIPFILE" "lib/$LIB32_NAME" "$LIB32_DEST" true

if [ "$IS64BIT" = true ]; then
  ui_print "- Extracting 64-bit libraries"
  extract "$ZIPFILE" "lib/$LIB64_NAME" "$LIB64_DEST" true
fi

ui_print "- Preparing runtime directory (gadget is not bundled)"
mkdir -p "$TMP_MODULE_DIR"

extract "$ZIPFILE" "config.json.example" "$TMP_MODULE_DIR" true

if [ ! -f "$TMP_MODULE_DIR/config.json" ]; then
  ui_print "- Writing empty target list"
  printf '%s\n' '{ "targets": [] }' > "$TMP_MODULE_DIR/config.json"
elif grep -q 'com.example.package' "$TMP_MODULE_DIR/config.json"; then
  NAME_COUNT=$(grep -c '"app_name"' "$TMP_MODULE_DIR/config.json" || true)
  if [ "$NAME_COUNT" = "1" ]; then
    ui_print "- Removing leftover demo target"
    printf '%s\n' '{ "targets": [] }' > "$TMP_MODULE_DIR/config.json"
  fi
fi

DEFAULT_GADGET_CFG='{"interaction":{"type":"listen","address":"0.0.0.0","port":27042,"on_load":"resume"}}'
OLD_DEFAULT_GADGET_CFG='{"interaction":{"type":"listen","address":"0.0.0.0","port":27042}}'

if [ ! -f "$TMP_MODULE_DIR/libsecmon.config.so" ]; then
  ui_print "- Writing default gadget config (listen + on_load resume)"
  printf '%s\n' "$DEFAULT_GADGET_CFG" > "$TMP_MODULE_DIR/libsecmon.config.so"
else
  CURRENT_GADGET_CFG=$(tr -d '[:space:]' < "$TMP_MODULE_DIR/libsecmon.config.so")
  if [ "$CURRENT_GADGET_CFG" = "$OLD_DEFAULT_GADGET_CFG" ]; then
    ui_print "- Updating stock gadget config to on_load resume"
    printf '%s\n' "$DEFAULT_GADGET_CFG" > "$TMP_MODULE_DIR/libsecmon.config.so"
  fi
fi

if [ ! -f "$TMP_MODULE_DIR/libsecmon.so" ]; then
  ui_print "! No gadget installed. Use WebUI or copy a .so to:"
  ui_print "  $TMP_MODULE_DIR/libsecmon.so"
fi

set_perm_recursive "$TMP_MODULE_DIR" 0 0 0755 0644
set_perm_recursive "$MODPATH" 0 0 0755 0644
