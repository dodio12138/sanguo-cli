import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

class Element {
  children=[];dataset={};attributes={};style={};hidden=false;listeners={};textContent="";
  constructor(tag="div"){this.tag=tag;const names=new Set;this.classList={contains:name=>names.has(name),add:(...list)=>list.forEach(name=>names.add(name)),remove:(...list)=>list.forEach(name=>names.delete(name)),toggle:(name,force)=>{const enabled=force??!names.has(name);enabled?names.add(name):names.delete(name);return enabled}}}
  set className(value){this.classes=value;value.split(" ").forEach(name=>this.classList.add(name))}
  setAttribute(name,value){this.attributes[name]=value}
  append(...nodes){for(const node of nodes)node.parent=this;this.children.push(...nodes)}
  prepend(...nodes){for(const node of nodes)node.parent=this;this.children.unshift(...nodes)}
  insertBefore(node,before){node.parent=this;this.children.splice(this.children.indexOf(before),0,node)}
  remove(){const index=this.parent?.children.indexOf(this)??-1;if(index>=0)this.parent.children.splice(index,1)}
  addEventListener(name,fn){(this.listeners[name]??=new Set).add(fn)}
  removeEventListener(name,fn){this.listeners[name]?.delete(fn)}
  send(name,event={}){for(const fn of [...(this.listeners[name]||[])])fn({preventDefault(){},...event})}
  focus(){}
  setPointerCapture(id){this.pointerId=id}
  hasPointerCapture(id){return this.pointerId===id}
  releasePointerCapture(){this.pointerId=null}
  getBoundingClientRect(){return this.tag==="button"?{left:Number.parseFloat(this.style.left)||0,top:Number.parseFloat(this.style.top)||0,width:72,height:76}:{left:0,top:0,width:1400,height:720}}
  querySelectorAll(selector){const nodes=this.children.flatMap(node=>[node,...node.querySelectorAll("*")]);return nodes.filter(node=>selector==="*"||selector==="button"&&node.tag==="button"||selector==="[data-task-window]"&&node.dataset.taskWindow||selector==="[data-task-dialog]"&&node.dataset.taskDialog)}
}
const windowIds=["mapWindow","factionPanel","commandsRailPanel","resourcePanel","calendarWindow","selectionRailPanel","forcesRailPanel"];
const ledgerLabels={military:"军政",domestic:"内治",diplomacy:"外交",intelligence:"情报",officers:"人物",policy:"政策"};
const ledgerLogos={military:"military-affairs",domestic:"domestic-affairs",diplomacy:"diplomacy",intelligence:"intelligence",officers:"officers",policy:"policy"};
const reportLogos={battleReportButton:"battle-report",reportButton:"daily-report",openChronicleButton:"chronicle-archive"};
const dock=new Element,workspace=new Element,windows=windowIds.map(id=>{const node=new Element;node.dataset={windowId:id,windowTitle:id};node.classList.add("os-window");return node});
const ledgerButtons=Object.entries(ledgerLabels).map(([kind,label])=>{const node=new Element("button");node.dataset.ledger=kind;node.textContent=label;return node});
const ids=new Map(["goldValue","foodValue","prestigeValue","dateLabel"].map(id=>[id,new Element]));ids.get("dateLabel").textContent="200年1月上旬";
for(const [id,label] of Object.entries({battleReportButton:"战报",reportButton:"日报",openChronicleButton:"史官月录",aiSettingsButton:"设置"})){const node=new Element("button");node.textContent=label;ids.set(id,node)}
const document={getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),querySelector:selector=>selector===".main-nav"?dock:selector===".workspace"?workspace:windows.find(node=>selector.includes(`"${node.dataset.windowId}"`)),querySelectorAll:selector=>selector.includes("is-active")?windows.filter(node=>node.classList.contains("is-active")):selector==="[data-ledger]"?ledgerButtons:[]};
const stored=new Map,eventHost=new Element;
document.addEventListener=eventHost.addEventListener.bind(eventHost);document.removeEventListener=eventHost.removeEventListener.bind(eventHost);
const context=vm.createContext({document,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>fn(),addEventListener:eventHost.addEventListener.bind(eventHost),removeEventListener:eventHost.removeEventListener.bind(eventHost),setInterval(){},MutationObserver:class{observe(){}},Date});
const source=fs.readFileSync(new URL("../js/ui/os-window-manager.js",import.meta.url),"utf8");
vm.runInContext(source.slice(0,source.lastIndexOf("  if(document.readyState"))+"globalThis.desktopTest={createDesktopShortcuts,createTaskStrip,openWindow,closeWindow,toggleMinimize,focusWindow,updateTasks,syncTaskButton};})();",context);
const api=context.desktopTest;
api.createDesktopShortcuts(windows);api.createTaskStrip(windows);
const shortcuts=workspace.children[0].children;
const windowLogos={mapWindow:"strategy-map",factionPanel:"player-faction",commandsRailPanel:"military-orders",resourcePanel:"treasury-reserve",calendarWindow:"calendar-almanac",selectionRailPanel:"region-selection",forcesRailPanel:"world-powers"};
const appLogos={...windowLogos,...Object.fromEntries(Object.entries(ledgerLogos).map(([kind,asset])=>[`ledger-${kind}`,asset])),...Object.fromEntries(Object.entries(reportLogos).map(([buttonId,asset])=>[`app-${buttonId}`,asset])),"app-aiSettingsButton":"ai-advisor"};
const appOrder=[...windowIds,...Object.keys(ledgerLogos).map(kind=>`ledger-${kind}`),"app-battleReportButton","app-reportButton","app-openChronicleButton","app-aiSettingsButton"];
const defaultApps=["mapWindow","factionPanel","commandsRailPanel"];
assert.equal(shortcuts.length,defaultApps.length,"桌面默认只保留最开始的三个图标");
assert.deepEqual(shortcuts.map(button=>button.dataset.desktopApp),defaultApps,"开局图标为舆图、本势力与军令");
assert.deepEqual(shortcuts.map(button=>[button.dataset.gridColumn,button.dataset.gridRow]),defaultApps.map((_,row)=>["0",String(row)]));
assert.equal(new Set(shortcuts.map(button=>`${button.dataset.gridColumn}:${button.dataset.gridRow}`)).size,shortcuts.length,"桌面图标不能重叠");
const checkIcon=shortcut=>{const image=shortcut.children[0];assert(!shortcut.children.some(child=>child.classList?.contains("os-shortcut-seal")),`${shortcut.dataset.desktopApp} 不应退回文字印章`);assert.equal(image.src,`assets/icons/${appLogos[shortcut.dataset.desktopApp]}.svg`,shortcut.dataset.desktopApp);assert(fs.existsSync(new URL(`../${image.src}`,import.meta.url)));assert(fs.readFileSync(new URL(`../${image.src}`,import.meta.url),"utf8").includes("<svg"))};
for(const shortcut of shortcuts)checkIcon(shortcut);
const pageHtml=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
for(const kind of [...pageHtml.matchAll(/data-ledger="([^"]+)"/g)].map(match=>match[1]))assert(source.includes(`${kind}:["`),`index.html 的 ${kind} 档案缺少桌面前缀图标`);
assert(source.includes('app-aiSettingsButton')&&pageHtml.includes('id="aiSettingsButton"'),"军师设置按钮应能创建桌面快捷方式");
assert(source.includes('openChronicleButton:["史官档案"')&&pageHtml.includes('id="openChronicleButton"'),"史官档案应能创建桌面快捷方式");
const strip=dock.children.find(node=>node.classList.contains("os-task-strip")),map=windows[0],task=strip.children.find(button=>button.dataset.taskWindow==="mapWindow"),shortcut=shortcuts[0];
api.closeWindow(map);assert.equal(task.hidden,true);
shortcut.onclick({detail:1});assert.equal(map.classList.contains("is-closed"),true,"单击只选中");assert.equal(shortcut.attributes["aria-pressed"],"true");
shortcut.ondblclick();assert.equal(map.classList.contains("is-closed"),false);assert.equal(task.hidden,false);assert.equal(task.classList.contains("is-active"),true);
task.onclick();assert.equal(map.classList.contains("is-minimized"),true);assert.equal(task.hidden,false,"最小化仍在任务栏");
task.onclick();assert.equal(map.classList.contains("is-minimized"),false);
api.focusWindow(windows[1]);task.onclick();assert.equal(map.classList.contains("is-minimized"),false,"点击后台任务不能最小化");assert.equal(map.classList.contains("is-active"),true);
api.closeWindow(map);shortcut.onclick({detail:0});assert.equal(task.hidden,false,"键盘可打开应用");
for(const window of windows){api.closeWindow(window);assert.equal(strip.children.find(button=>button.dataset.taskWindow===window.dataset.windowId).hidden,true);api.openWindow(window);assert.equal(strip.children.find(button=>button.dataset.taskWindow===window.dataset.windowId).hidden,false)}
const resource=dock.children.find(node=>node.classList.contains("os-resource-tray")),calendar=dock.children.find(node=>node.classList.contains("os-calendar-tray"));
api.closeWindow(windows[3]);assert.equal(resource.hidden,true);api.openWindow(windows[3]);assert.equal(resource.hidden,false);
api.toggleMinimize(windows[4]);assert.equal(calendar.hidden,false);api.closeWindow(windows[4]);assert.equal(calendar.hidden,true);
const dialogTask=new Element("button");
for(const [state,hidden] of [[{closed:true,minimized:false,active:false},true],[{closed:false,minimized:true,active:false},false],[{closed:false,minimized:false,active:true},false]]){api.syncTaskButton(dialogTask,state);assert.equal(dialogTask.hidden,hidden)}
assert(source.includes('task.dataset.taskDialog=dialog.id'));
assert(source.includes('const applications=makeSubmenu("桌面应用"'));
assert(!source.includes('move($("commandBookButton"),menu)'));
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.equal((html.match(/id="commandBookButton"/g)||[]).length,1);
assert(html.slice(html.indexOf('<form id="commandForm"'),html.indexOf('</form>',html.indexOf('<form id="commandForm"'))).includes('id="commandBookButton" type="button"'));
assert(html.includes("本势力"));assert(!html.includes("己方势力"));assert(!source.includes("己方势力"));
const css=fs.readFileSync(new URL("../css/os-desktop.css",import.meta.url),"utf8");assert(css.includes(".os-task-button[hidden],.os-resource-tray[hidden],.os-calendar-tray[hidden]{display:none!important}"));
console.log("桌面应用回归通过：默认桌面三图标 / 窗口与档案情报图标 / 单击选中与双击打开 / 键盘打开 / 后台激活 / 最小化保留 / 关闭移除 / 托盘同步 / 全应用重开入口");

const down=()=>{const box=shortcut.getBoundingClientRect();shortcut.send("pointerdown",{button:0,pointerId:1,pointerType:"mouse",clientX:box.left+20,clientY:box.top+20})};
const moveTo=(column,row)=>shortcut.send("pointermove",{pointerId:1,buttons:1,clientX:8+column*78+20,clientY:8+row*84+20});
api.closeWindow(map);down();moveTo(4,3);shortcut.send("pointerup",{pointerId:1});
assert.equal(shortcut.style.left,"320px");assert.equal(shortcut.style.top,"260px");
assert.equal(shortcut.dataset.gridColumn,"4");assert.equal(shortcut.dataset.gridRow,"3");
assert.deepEqual(JSON.parse(stored.get("sanguo.os-desktop-icons.v1")).mapWindow,{column:4,row:3});
shortcut.ondblclick();assert.equal(map.classList.contains("is-closed"),true,"拖动不能误开应用");
const beforeCancel={left:shortcut.style.left,top:shortcut.style.top},saved=stored.get("sanguo.os-desktop-icons.v1");
for(const cancel of [()=>shortcut.send("pointercancel",{pointerId:1}),()=>eventHost.send("blur")]){
  down();moveTo(10,5);cancel();assert.equal(shortcut.style.left,beforeCancel.left);assert.equal(shortcut.style.top,beforeCancel.top);assert.equal(stored.get("sanguo.os-desktop-icons.v1"),saved);assert.equal(shortcut.hasPointerCapture(1),false);
}
down();moveTo(Number(shortcuts[1].dataset.gridColumn),Number(shortcuts[1].dataset.gridRow));shortcut.send("pointerup",{pointerId:1});
assert.equal(new Set(shortcuts.map(button=>`${button.dataset.gridColumn}:${button.dataset.gridRow}`)).size,shortcuts.length,"图标不能重叠");
down();moveTo(100,-100);shortcut.send("pointerup",{pointerId:1});assert.equal(shortcut.dataset.gridColumn,"16");assert.equal(shortcut.dataset.gridRow,"0","不可拖出桌面");
api.createDesktopShortcuts(windows);const restored=workspace.children[0].children[0];assert.equal(restored.style.left,shortcut.style.left);assert.equal(restored.style.top,shortcut.style.top);
console.log("桌面拖动回归通过：网格吸附 / 位置持久化与恢复 / 占位避让 / 边界限制 / 防误打开 / 取消与失焦恢复 / 指针释放");

const registry=api.createDesktopShortcuts(windows),addedDesktop=workspace.children[0];
assert.equal(registry.has("resourcePanel"),false,"默认桌面不铺满全部图标");
assert.deepEqual(addedDesktop.children.map(button=>button.dataset.desktopApp),defaultApps);
assert.equal(registry.add("mapWindow"),false,"已在桌面的窗口不能重复创建");
assert.equal(registry.add("resourcePanel"),true);
assert.equal(registry.add("resourcePanel"),false,"禁止重复快捷方式");assert.equal(registry.add("invalid"),false);
assert(JSON.parse(stored.get("sanguo.os-desktop-shortcuts.v4")).includes("resourcePanel"));
const added=addedDesktop.children.find(button=>button.dataset.desktopApp==="resourcePanel");
assert.equal(added.children[0].src,"assets/icons/treasury-reserve.svg","重新创建的府库快捷方式应使用府库图标");
for(const id of appOrder)registry.add(id);
assert.deepEqual(addedDesktop.children.map(button=>button.dataset.desktopApp),appOrder,"主力窗口在前，档案情报与军师紧随其后");
assert.equal(new Set(addedDesktop.children.map(button=>`${button.dataset.gridColumn}:${button.dataset.gridRow}`)).size,appOrder.length,"桌面图标不能重叠");
for(const shortcut of addedDesktop.children)checkIcon(shortcut);
registry.remove("resourcePanel");assert.equal(registry.has("resourcePanel"),false);
assert(!JSON.parse(stored.get("sanguo.os-desktop-shortcuts.v4")).includes("resourcePanel"));
api.createDesktopShortcuts(windows);assert.equal(workspace.children[0].children.length,appOrder.length-1,"快捷方式数量按存档恢复");
assert(source.includes('button.dataset.shortcutWindow=window.dataset.windowId'));
assert(source.includes('ledger-${button.dataset.ledger}'));
console.log("快捷方式回归通过：默认三图标 / 动态创建 / 去重与校验 / 网格避让 / 保存恢复 / 移除快捷方式 / 汉菜单入口");
