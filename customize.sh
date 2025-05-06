ui_print "- Partition Backup"
sleep 0.5
ui_print "- Magisk Module to backup Android Device Partition"
sleep 0.5
ui_print "- $([ -f "${MODPATH}/module.prop" ] && grep -E "^version=" "${MODPATH}/module.prop") "
sleep 0.5


if [ "${APATCH}" ]; then
    ui_print "- APatch: ${APATCH_VER} │ ${APATCH_VER_CODE}"
    bin_dir="/data/adb/ap/bin"
    rm -f "${MODPATH}/action.sh"
elif [ "${KSU}" ]; then
    ui_print "- KSU: ${KSU_KERNEL_VER_CODE} │ ${KSU_VER_CODE}"
    bin_dir="/data/adb/ksu/bin"
    rm -f "${MODPATH}/action.sh"
elif [ "${MAGISK_VER_CODE}" ]; then
    ui_print "- Magisk: ${MAGISK_VER} │ ${MAGISK_VER_CODE}"
    bin_dir="/data/adb/magisk"
fi    
            
 busybox=${bin_dir}/busybox
[ ! -f "/system/bin/bc" ] && cp "$MODPATH/bc/bc-$(getprop ro.product.cpu.abi)" "$MODPATH/system/bin/bc"

[ ! -f "/system/bin/blockdev" ] && ln -s "${busybox}" "${MODPATH}/system/bin/blockdev"

[ ! -f "/system/bin/dd" ] && ln -s "${busybox}" "${MODPATH}/system/bin/dd"


ui_print "- Checking for partitions"
paths="/dev/block/by-name /dev/block/bootdevice/by-name /dev/block/platform/$(grep -o 'androidboot.boot_devices=[^ ]*' /proc/cmdline | cut -d '=' -f2)/by-name"
found=""

for p in $paths; do
  if [ -d "$p" ] && ls "$p"/boot* >/dev/null 2>&1; then
    ui_print "- Found in: $p"
    found="$p"
    break
  fi
done


[ -z "$found" ] && abort "- couldn't detect partitions. Aborting Installation"
set_perm_recursive "$MODPATH" 0 0 0755 0644
chmod +x "$MODPATH/system/bin/partition"
