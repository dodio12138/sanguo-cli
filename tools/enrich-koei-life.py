#!/usr/bin/env python3
"""Merge SAN11 birth/death/debut metadata from 人物.xlsx into the compact JSON index."""
import json, re, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

workbook = Path(sys.argv[1])
target = Path(sys.argv[2] if len(sys.argv) > 2 else "game/data/reference/officers-san11.json")
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

with zipfile.ZipFile(workbook) as archive:
    shared = []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    for item in root.findall("m:si", ns):
        shared.append("".join(node.text or "" for node in item.iter("{%s}t" % ns["m"])))
    # 上游工作簿的 Sheet3 是经过简体化的完整人物表。
    sheet = ET.fromstring(archive.read("xl/worksheets/sheet2.xml"))
    records = {}
    for row in sheet.findall(".//m:row", ns)[1:]:
        cells = {}
        for cell in row.findall("m:c", ns):
            value = cell.find("m:v", ns)
            if value is None:
                continue
            text = value.text or ""
            if cell.attrib.get("t") == "s":
                text = shared[int(text)]
            column = re.match(r"[A-Z]+", cell.attrib["r"]).group()
            cells[column] = text
        if cells.get("A"):
            number = lambda key: int(cells[key]) if cells.get(key, "").isdigit() else None
            records[cells["A"]] = {"birthYear": number("N"), "deathYear": number("O"), "debutYear": number("P"), "discoverPlace": cells.get("Q") or None, "affinity": number("R")}

payload = json.loads(target.read_text())
matched = 0
for officer in payload["officers"]:
    metadata = records.get(officer["name"])
    if metadata:
        officer.update(metadata)
        matched += 1
payload["life_data_source"] = "koei_san_data/san11/人物.xlsx Sheet3"
payload["life_data_matched"] = matched
target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
print(f"生卒与登场资料匹配 {matched}/{len(payload['officers'])} 人。")
