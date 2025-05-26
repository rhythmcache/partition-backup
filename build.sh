#!/bin/bash

set -e

SRC="src/partition.c"
OUT_DIR="module/bins"
MODULE_DIR="module"
API=21
mkdir -p "$OUT_DIR"


CFLAGS="-Os -flto -fomit-frame-pointer -fdata-sections -ffunction-sections -Wl,--gc-sections -static"


archs=(
    "aarch64-linux-android-clang"
    "armv7a-linux-androideabi-clang"
    "i686-linux-android-clang"
    "x86_64-linux-android-clang"
)

names=("arm64-v8a" "armeabi-v7a" "x86" "x86_64")

for i in {0..3}; do
    echo "Building for ${names[i]}..."
    ${archs[i]} $CFLAGS $SRC -o "$OUT_DIR/partition-${names[i]}"
    llvm-strip --strip-all "$OUT_DIR/partition-${names[i]}"
done

# Create zip in module directory
echo "Creating zip..."
cd "$MODULE_DIR" && zip -r9 ../partition-backup.zip *
