import fs from "node:fs";

const root=new URL("../",import.meta.url),html=fs.readFileSync(new URL("index.html",root),"utf8"),css=fs.readFileSync(new URL("css/os-desktop.css",root),"utf8"),source=fs.readFileSync(new URL("js/ui/os-window-manager.js",root),"utf8");
if(!html.includes("css/os-desktop.css")||!html.includes("js/ui/os-window-manager.js"))throw new Error("桌面窗口资源未接入主页");
for(const id of ["calendarWindow","mapWindow","factionPanel","selectionRailPanel","forcesRailPanel","commandsRailPanel","ordersRailPanel","situationRailPanel"])if(!source.includes(`id:"${id}"`))throw new Error(`窗口管理器缺少 ${id}`);
for(const feature of ["bindDrag","addResizeGrip","toggleMinimize","toggleMaximize","createDesktopShortcuts","createTaskStrip","bindDialogs"])if(!source.includes(`function ${feature}`))throw new Error(`窗口管理器缺少 ${feature}`);
for(const selector of [".os-window.is-active",".os-window.is-minimized",".os-window.is-maximized",".os-window-resize",".os-desktop-shortcuts",".os-task-strip"])if(!css.includes(selector))throw new Error(`桌面样式缺少 ${selector}`);
console.log("桌面窗口界面通过：8 个窗口 / 独立历法 / 拖动 / 缩放 / 最小化 / 最大化 / 任务栏 / 快捷入口 / 弹窗拖动");
