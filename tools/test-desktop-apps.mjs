import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

class Element {
  children=[];dataset={};attributes={};style={};hidden=false;listeners={};textContent="";
  constructor(tag="div"){this.tag=tag;const names=new Set;this.classList={contains:name=>names.has(name),add:(...list)=>list.forEach(name=>names.add(name)),remove:(...list)=>list.forEach(name=>names.delete(name)),toggle:(name,force)=>{const enabled=force??!names.has(name);enabled?names.add(name):names.delete(name);return enabled}}}
  set className(value){this.classes=value;value.split(" ").forEach(name=>this.classList.add(name))}
  setAttribute(name,value){this.attributes[name]=value}
  append(...nodes){this.children.push(...nodes)}
  prepend(...nodes){this.children.unshift(...nodes)}
  insertBefore(node,before){this.children.splice(this.children.indexOf(before),0,node)}
  addEventListener(name,fn){this.listeners[name]=fn}
  querySelectorAll(selector){const nodes=this.children.flatMap(node=>[node,...node.querySelectorAll("*")]);return nodes.filter(node=>selector==="*"||selector==="button"&&node.tag==="button"||selector==="[data-task-window]"&&node.dataset.taskWindow||selector==="[data-task-dialog]"&&node.dataset.taskDialog)}
}
const dock=new Element,workspace=new Element,windows=["mapWindow","factionPanel","commandsRailPanel","resourcePanel","calendarWindow"].map(id=>{const node=new Element;node.dataset={windowId:id,windowTitle:id};node.classList.add("os-window");return node});
const ids=new Map(["goldValue","foodValue","prestigeValue","dateLabel"].map(id=>[id,new Element]));ids.get("dateLabel").textContent="200年1月上旬";
const document={getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),querySelector:selector=>selector===".main-nav"?dock:selector===".workspace"?workspace:windows.find(node=>selector.includes(`"${node.dataset.windowId}"`)),querySelectorAll:selector=>selector.includes("is-active")?windows.filter(node=>node.classList.contains("is-active")):[]};
const context=vm.createContext({document,localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),setInterval(){},MutationObserver:class{observe(){}},Date});
const source=fs.readFileSync(new URL("../js/ui/os-window-manager.js",import.meta.url),"utf8");
vm.runInContext(source.slice(0,source.lastIndexOf("  if(document.readyState"))+"globalThis.desktopTest={createDesktopShortcuts,createTaskStrip,openWindow,closeWindow,toggleMinimize,focusWindow,updateTasks,syncTaskButton};})();",context);
const api=context.desktopTest;
api.createDesktopShortcuts(windows);api.createTaskStrip(windows);
const shortcuts=workspace.children[0].children;
assert.equal(shortcuts.length,3);
for(const shortcut of shortcuts){const image=shortcut.children[0];assert(fs.existsSync(new URL(`../${image.src}`,import.meta.url)));assert(fs.readFileSync(new URL(`../${image.src}`,import.meta.url),"utf8").includes("<svg"))}
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
const css=fs.readFileSync(new URL("../css/os-desktop.css",import.meta.url),"utf8");assert(css.includes(".os-task-button[hidden],.os-resource-tray[hidden],.os-calendar-tray[hidden]{display:none!important}"));
console.log("桌面应用回归通过：三款图标 / 单击选中与双击打开 / 键盘打开 / 后台激活 / 最小化保留 / 关闭移除 / 托盘同步 / 全应用重开入口");
