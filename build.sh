#!/bin/bash
set -e

SRC="src/partition.c"
OUT_DIR="module/bins"
MODULE_DIR="module"
API=21
mkdir -p "$OUT_DIR"

CFLAGS="-O2 -flto -fomit-frame-pointer -ffunction-sections -fdata-sections -std=c99"
LDFLAGS="-flto -Wl,--gc-sections -Wl,-O2 -Wl,-z,relro,-z,now -Wl,--as-needed"

export PATH="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin":$PATH

archs=(
    "aarch64-linux-android${API}-clang"
    "armv7a-linux-androideabi${API}-clang"
    "i686-linux-android${API}-clang"
    "x86_64-linux-android${API}-clang"
    "riscv64-linux-android35-clang"
)

names=("arm64-v8a" "armeabi-v7a" "x86" "x86_64" "riscv64")

for i in {0..4}; do
    echo "Building for ${names[i]}..."
    ${archs[i]} $CFLAGS $SRC -o "$OUT_DIR/partition-${names[i]}" $LDFLAGS
    llvm-strip --strip-all "$OUT_DIR/partition-${names[i]}"
done

cd "$MODULE_DIR" && zip -r ../partition-backup.zip *