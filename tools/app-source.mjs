// 界面源码读取：app.js 已拆为启动壳 + js/ui/app/*.js 功能模块（按 index.html 载入顺序）。
// 测试做源码静态检查时用 appSource() 取合并后的文本，不必关心某段代码在哪个文件。
import fs from "node:fs";
const root=new URL("../",import.meta.url);
export function appFiles(){const html=fs.readFileSync(new URL("index.html",root),"utf8");return [...html.matchAll(/src="(js\/ui\/app\/[\w-]+\.js)[?"]/g)].map(m=>m[1]).concat("js/ui/app.js")}
export function appSource(){return appFiles().map(file=>fs.readFileSync(new URL(file,root),"utf8")).join("\n")}
