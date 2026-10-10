import fs from "node:fs/promises";

const [css,html]=await Promise.all([
  fs.readFile(new URL("../css/ui-polish.css",import.meta.url),"utf8"),
  fs.readFile(new URL("../index.html",import.meta.url),"utf8")
]);
for(const rule of [
  ".command-dialog { width: min(760px, 94vw); max-width: min(760px, 94vw)",
  ".command-browser { grid-template-columns: minmax(112px, 150px) minmax(0, 1fr)",
  ".command-browser section { grid-template-columns: repeat(2, minmax(0, 1fr))",
  ".command-choice { position: relative; display: grid; grid-template-columns: minmax(0, 1fr)",
  "@media (max-width: 560px)",
  ".command-browser section { grid-template-columns: minmax(0, 1fr)"
])if(!css.includes(rule))throw new Error(`命令簿布局缺少防溢出规则：${rule}`);
if(!html.includes("ui-polish.css?v=20261010-04")||!html.includes("app.js?v=20261010-06"))throw new Error("命令簿样式缓存版本未更新");
console.log("命令簿布局通过：弹窗宽度限制 / 网格最小宽度 / 命令说明换行 / 窄屏单列");
