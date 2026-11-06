import os, sys, zipfile

apk, dex = sys.argv[1], sys.argv[2]
tmp = apk + '.tmp'

zin = zipfile.ZipFile(apk, 'r')
zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    if it.filename == 'classes.dex':
        continue
    zout.writestr(it, zin.read(it.filename))
zout.write(dex, 'classes.dex')
zout.close()
zin.close()
os.replace(tmp, apk)
print('   dex 已写入', os.path.getsize(dex), '字节')
