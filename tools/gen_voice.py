import asyncio, edge_tts, os, sys

VOICE = "zh-CN-XiaoxiaoNeural"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "voice")

LINES = [
    ("single",    "单张"),
    ("pair",      "对子"),
    ("triple",    "三张"),
    ("fullhouse", "三带二"),
    ("straight",  "顺子"),
    ("tube",      "三连对"),
    ("plate",     "钢板"),
    ("bomb",      "炸弹"),
    ("flush",     "同花顺"),
    ("jokerbomb", "天王炸"),
    ("pass",      "不要"),
    ("one",       "报单"),
    ("two",       "报双"),
    ("jiefeng",   "接风"),
    ("first",     "头游"),
    ("last",      "末游"),
]

async def gen(name, text):
    path = os.path.join(OUT, name + ".mp3")
    c = edge_tts.Communicate(text, VOICE, rate="+14%", volume="+0%")
    await c.save(path)
    return os.path.getsize(path)

async def main():
    total = 0
    for name, text in LINES:
        try:
            sz = await gen(name, text)
            total += sz
            print(f"  {name:10s} {text}\t{sz//1024}KB")
        except Exception as e:
            print("  FAIL", name, e)
    print("合计", total // 1024, "KB")

asyncio.run(main())
