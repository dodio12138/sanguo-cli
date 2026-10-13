"""按剧本目录文字截取开局剧本卡片字体子集。

用法：python3 tools/subset-start-fonts.py <字体源目录>
源目录需包含 WenYue-GuDianMingChaoTi.otf 与 daofeng.ttf（来自 Descent-Chart-Generator），需要 fonttools 与 brotli。
修改 game/data/history/scenarios/index.json 的剧本名、日期或简介后重新运行。
"""
import json
import string
import sys
from pathlib import Path

from fontTools import subset

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
catalog = json.loads((root / "game/data/history/scenarios/index.json").read_text(encoding="utf-8"))["scenarios"]
names = "".join(item["name"] for item in catalog)
card_text = "".join(item["name"] + item["date"] + item["description"] for item in catalog)
latin = string.ascii_letters + string.digits + string.punctuation + " "
punctuation = "，。、；：？！“”‘’（）《》·—…／"
output = root / "assets/fonts"
output.mkdir(parents=True, exist_ok=True)

for font, target, text in [
    ("WenYue-GuDianMingChaoTi.otf", "start-wenyue.woff2", card_text + latin + punctuation),
    ("daofeng.ttf", "start-daofeng.woff2", names),
]:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    loaded = subset.load_font(str(source / font), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(sorted(set(text))))
    subsetter.subset(loaded)
    subset.save_font(loaded, str(output / target), options)
    print(f"{target}: {len(set(text))} 字符, {(output / target).stat().st_size // 1024} KB")
