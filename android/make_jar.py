import os, sys, zipfile

src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
n = 0
for root, dirs, files in os.walk(src):
    for f in files:
        if f.endswith('.class'):
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src).replace('\\', '/'))
            n += 1
z.close()
print('   class 数量:', n)
