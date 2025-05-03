#!/bin/sh
ui_print "- PartBak"
sleep 0.5
ui_print "- CLI Utility to backup Android Device Partition"
sleep 0.5
ui_print "- $([ -f "${MODPATH}/module.prop" ] && grep -E "^version=" "${MODPATH}/module.prop") "
sleep 0.5
ui_print "- Checking Installation Environment"
sleep 0.5

case $APATCH$KSU$MAGISK_VER_CODE in
  *$APATCH*) ui_print "- APatch: $APATCH_VER │ $APATCH_VER_CODE" ;;
  *$KSU*) ui_print "- KSU: $KSU_KERNEL_VER_CODE │ $KSU_VER_CODE" ;;
  *$MAGISK_VER_CODE*) ui_print "- Magisk: $MAGISK_VER │ $MAGISK_VER_CODE" ;;
esac

ui_print "- Checking for partitions"
paths=(
  "/dev/block/by-name"\
  "/dev/block/bootdevice/by-name"\
  "/dev/block/platform/$(grep -o 'androidboot.boot_devices=[^ ]*' /proc/cmdline | cut -d '=' -f2)/by-name"
)

found=""

for p in "${paths[@]}"; do
  if [ -d "$p" ] && ls "$p"/boot* >/dev/null 2>&1; then
    ui_print "- Found in: $p"
    found="$p"
    break
  fi
done

[ -z "$found" ] && abort "- couldnt detect partitions. Aborting Installation"

set_perm_recursive "$MODPATH" 0 0 0755 0644
chmod +x "$MODPATH/system/bin/"*
