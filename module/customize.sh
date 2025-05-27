ui_print "- Partition Backup"
sleep 0.5
ui_print "- Utility To Backup or Save Android Device Partition"
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

mkdir -p "${MODPATH}/system/bin"
            
[ -f "${bin_dir}/busybox" ] && busybox="${bin_dir}/busybox"

[ ! -f "/system/bin/blockdev" ] && ln -s "${busybox}" "${MODPATH}/system/bin/blockdev"

[ ! -f "/system/bin/dd" ] && ln -s "${busybox}" "${MODPATH}/system/bin/dd"


cp "${MODPATH}/bins/partition-$(getprop ro.product.cpu.abi)" "${MODPATH}/system/bin/partition"
rm -rf "${MODPATH}/bins"

set_perm_recursive "$MODPATH" 0 0 0755 0644
