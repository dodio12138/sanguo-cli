// 界面动效与窗口外观一致性的源码约束：动效只用轻量属性且可关闭；对话框标题与关闭钮统一。
import fs from "node:fs";
import assert from "node:assert/strict";
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const html=read("index.html"),motion=read("css/motion.css"),buttons=read("css/button-states.css"),app=read("js/ui/app.js"),wm=read("js/ui/os-window-manager.js");

assert.match(html,/css\/button-states\.css\?v=[0-9a-f]+">\s*<link rel="stylesheet" href="css\/motion\.css\?v=[0-9a-f]+">/,"motion.css 在按钮状态之后载入");
const keyframes=[...motion.matchAll(/@keyframes [\w-]+\{([^@]*?)\}\s*(?=@keyframes|\n)/g)].map(match=>match[1]).join(" ");
for(const property of keyframes.match(/[a-z-]+(?=:)/g)||[])assert(["opacity","transform"].includes(property),`动效关键帧只改 opacity/transform，发现 ${property}`);
assert(!/infinite/.test(motion),"动效不做常驻循环");
assert(!/canvas|#mapCanvas/.test(motion),"动效不碰舆图画布");
assert.match(motion,/html\.ui-motion-off \*[^{]*\{animation:none!important;transition:none!important\}/,"设置可整体关闭动效");
assert.match(buttons,/prefers-reduced-motion:reduce[\s\S]*translate:none/,"系统减少动态时按钮不下沉");
assert.match(html,/id="gameUiMotion"/);assert.match(app,/uiMotion:true/);assert.match(app,/classList\.toggle\("ui-motion-off",userSettings\.uiMotion===false\)/);

assert.match(wm,/"messageCenterDialog"\]\),tasks=new Map/,"消息汇总按托管窗口显示");
assert.match(wm,/const titleText=handle=>/,"任务栏标题跳过窗口按钮");assert(!/handle\.childNodes\[0\]\?\.textContent/.test(wm));
assert.match(wm,/if\(!managed\)for\(const button of handle\.querySelectorAll/,"非托管对话框关闭钮统一外观");
assert.match(read("css/ui-polish.css"),/\.message-center-tools>button\{/,"消息汇总按钮有终端样式");
console.log("界面动效与外观一致性通过：轻量关键帧 / 可关闭 / 减少动态 / 消息汇总托管 / 任务栏标题 / 关闭钮统一");
