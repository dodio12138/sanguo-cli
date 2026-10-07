import fs from "node:fs";

const source=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
const paintBody=source.match(/const paint=\(\)=>\{([\s\S]*?)\n    \}\n    function beginNewGame/)?.[1];
if(!paintBody||!source.includes("    paint()"))throw new Error("无法识别开局 paint 函数及其首次调用");
if(/;paint\(\)\s*$/.test(paintBody.trim()))throw new Error("paint 函数发生自递归，开局界面将卡死");
if(!source.includes('{id:"observer",name:"观察者"'))throw new Error("开局界面缺少观察者选项");
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
for(const id of ["startHomeView","startNewView","startLoadView","startSettingsView","startExitView","startSaveSlots","gameSaveSlots","gameSettingsDialog","chronicleEnabled","gameChronicleEnabled"])if(!html.includes(`id="${id}"`))throw new Error(`1.0 主菜单缺少页面或控件：${id}`);
const css=fs.readFileSync(new URL("../css/ui-polish.css",import.meta.url),"utf8");if(!css.includes(".start-screen [hidden]{display:none!important}"))throw new Error("主菜单的隐藏页面可能被 flex/grid 样式重新显示");
if(!source.includes("sanguo-cli.slot.")||!source.includes("resumeSlot"))throw new Error("缺少本地多槽存档管理");
console.log("1.0 开局界面通过：主菜单视图 / 观察者 / 本地存档槽 / 设置入口均存在");
