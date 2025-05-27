if pm list packages | grep -q "io.github.a13e300.ksuwebui"; then
    am start -n "io.github.a13e300.ksuwebui/.WebUIActivity" -e id "partition-backup"
elif pm list packages | grep -q "com.dergoogler.mmrl"; then
    am start -n "com.dergoogler.mmrl/.ui.activity.webui.WebUIActivity" -e MOD_ID "partition-backup"
else
    echo "Error: Can't Launch WebUI, KSUWebUI or MMRL not found."
fi
