#!/bin/bash
# 打包掼蛋单机 APK（aapt2 + javac + d8 + zipalign + apksigner）
set -e

SDK=${ANDROID_SDK:-$HOME/Android/Sdk}
BT=${BUILD_TOOLS:-$SDK/build-tools/36.1.0}
AJVER=${ANDROID_API:-android-34}

# Windows(Git Bash) 下的工具带 .exe 后缀
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) EXE=.exe ;;
  *) EXE= ;;
esac
AJ=$SDK/platforms/$AJVER/android.jar
OUT=../build/apk
KS=../build/guandan.jks

cd "$(dirname "$0")"

echo "== 0/7 同步网页资源到 assets"
mkdir -p assets/game
cp -f ../index.html ../app.css ../app.js assets/
cp -f ../game/engine.js ../game/logic.js assets/game/
mkdir -p assets/voice
cp -f ../voice/*.mp3 assets/voice/
rm -f assets/game/test_*.js

echo "== 1/7 清理"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "== 2/7 编译资源"
"$BT/aapt2$EXE" compile --dir res -o "$OUT/res.zip"

echo "== 3/7 链接资源与清单"
"$BT/aapt2$EXE" link -o "$OUT/base.apk" -I "$AJ" \
  --manifest AndroidManifest.xml -A assets \
  --java "$OUT/gen" --min-sdk-version 21 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0 "$OUT/res.zip"

echo "== 4/7 编译 Java"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$AJ" -nowarn \
  -d "$OUT/classes" "$OUT/gen/com/guandan/single/R.java" \
  java/com/guandan/single/MainActivity.java

echo "== 5/7 生成 dex"
python make_jar.py "$OUT/classes" "$OUT/classes.jar"
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --lib "$AJ" --min-api 21 \
  --output "$OUT/dex" "$OUT/classes.jar"

echo "== 6/7 打包 dex 并签名"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
python add_dex.py "$OUT/unsigned.apk" "$OUT/dex/classes.dex"

"$BT/zipalign$EXE" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KS" ]; then
  echo "   生成签名证书"
  keytool -genkeypair -keystore "$KS" -alias guandan -keyalg RSA -keysize 2048 \
    -validity 10950 -storepass guandan -keypass guandan \
    -dname "CN=Guandan Single, O=Personal, C=CN" >/dev/null 2>&1
fi

java -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass pass:guandan \
  --key-pass pass:guandan --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/GuandanSingle.apk" "$OUT/aligned.apk"

echo "== 7/7 校验"
java -jar "$BT/lib/apksigner.jar" verify --print-certs "$OUT/GuandanSingle.apk" | head -3
ls -lh "$OUT/GuandanSingle.apk"
echo "完成: $OUT/GuandanSingle.apk"
