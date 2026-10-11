import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const split=value=>String(value).split(",").map(item=>item.trim()).filter(Boolean);
function matchesOne(el,selector){
  let rest=selector.trim();
  const nots=[...rest.matchAll(/:not\(([^)]*)\)/g)].map(match=>match[1]);
  rest=rest.replace(/:not\([^)]*\)/g,"");
  const attrs=[...rest.matchAll(/\[([^\]]+)\]/g)].map(match=>match[1]);
  rest=rest.replace(/\[[^\]]+\]/g,"");
  const classes=[...rest.matchAll(/\.([\w-]+)/g)].map(match=>match[1]);
  const tag=rest.replace(/\.[\w-]+/g,"").trim();
  if(tag&&tag!=="*"&&el.tagName!==tag.toUpperCase())return false;
  if(classes.some(name=>!el.classList.contains(name)))return false;
  if(attrs.some(name=>!el.hasAttribute(name)))return false;
  return !nots.some(group=>split(group).some(item=>matchesOne(el,item)));
}
function parseHtml(html){
  return [...String(html).matchAll(/<(\w+)([^>]*)>([^<]*)<\/\1>/g)].map(match=>{
    const el=new El(match[1]);
    for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g))el.setAttribute(attr[1],attr[2]);
    el.textContent=match[3];
    return el;
  });
}
function descendants(root){const out=[];const walk=node=>node.children.forEach(child=>{out.push(child);walk(child)});walk(root);return out}
class El{
  constructor(tag){
    this.nodeType=1;this.tagName=String(tag).toUpperCase();this.id="";this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this._classes=new Set();this._value="";this.textContent="";this.hidden=false;this.disabled=false;this.multiple=false;this.size=0;this.type="";this.open=false;this.selectedIndex=0;this._listeners={};
    this.style={removeProperty(){},setProperty(){}};
    this.classList={add:(...names)=>names.forEach(name=>this._classes.add(name)),remove:(...names)=>names.forEach(name=>this._classes.delete(name)),contains:name=>this._classes.has(name),toggle:(name,force)=>{const on=force===undefined?!this._classes.has(name):!!force;on?this._classes.add(name):this._classes.delete(name);return on}};
  }
  get options(){return this.children.filter(child=>child.tagName==="OPTION")}
  get className(){return [...this._classes].join(" ")}
  set className(value){this._classes=new Set(String(value).split(/\s+/).filter(Boolean))}
  get innerHTML(){return this.children.map(child=>`<${child.tagName.toLowerCase()}>${child.textContent}</${child.tagName.toLowerCase()}>`).join("")}
  set innerHTML(html){this.replaceChildren(...parseHtml(html));this.selectedIndex=0;this._value=this.options[0]?.value??""}
  get value(){return this._value}
  set value(next){this._value=String(next??"");const index=this.options.findIndex(option=>option.value===this._value);if(index>=0)this.selectedIndex=index}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==="value")this._value=String(value)}
  getAttribute(name){return this.attrs[name]??null}
  hasAttribute(name){return name in this.attrs}
  removeAttribute(name){delete this.attrs[name]}
  append(...nodes){nodes.forEach(node=>{node.parentNode=this;this.children.push(node)})}
  insertBefore(node,reference){const index=this.children.indexOf(reference);node.parentNode=this;index<0?this.children.push(node):this.children.splice(index,0,node);return node}
  replaceChildren(...nodes){this.children=[];this.append(...nodes)}
  addEventListener(type,handler){(this._listeners[type]??=[]).push(handler)}
  dispatchEvent(event){(this._listeners[event.type]||[]).forEach(handler=>handler(event));return true}
  click(){this.dispatchEvent({type:"click",target:this})}
  focus(){}showModal(){this.open=true}close(){this.open=false}
  setPointerCapture(){}getContext(){return new Proxy({},{get:(target,key)=>key in target?target[key]:()=>{}})}
  getBoundingClientRect(){return {left:0,top:0,right:140,bottom:140,width:140,height:140}}
  closest(selector){let node=this;while(node){if(matchesOne(node,selector))return node;node=node.parentNode}return null}
  matches(selector){return split(selector).some(item=>matchesOne(this,item))}
  querySelectorAll(selector){const found=descendants(this).filter(node=>split(selector).some(item=>matchesOne(node,item)));return Object.assign(found,{forEach:found.forEach.bind(found),map:found.map.bind(found)})}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
}
const observers=[];
globalThis.MutationObserver=class{constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){}};
const body=new El("body"),dialog=new El("dialog"),byId=new Map();
dialog.id="mapEditorDialog";dialog.setAttribute("open","");body.append(dialog);
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const dialogHtml=html.slice(html.indexOf('id="mapEditorDialog"'),html.indexOf('id="eventDialog"'));
const canvasIds=new Set(["mapEditorCanvas","mapEditorOverlay"]),selectIds=new Set(["mapEditorLayer","mapEditorValue","mapEditorCity","mapEditorCityForce","mapEditorRoadFrom","mapEditorRoadTo"]);
for(const [,id] of dialogHtml.matchAll(/id="([A-Za-z0-9_]+)"/g)){
  const el=new El(canvasIds.has(id)?"canvas":selectIds.has(id)?"select":id.startsWith("mapEditorTool")?"button":id.startsWith("mapEditorPanel")?"section":"div");
  el.id=id;byId.set(id,el);dialog.append(el);
  const inner=id.startsWith("mapEditor")?new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(dialogHtml):null;
  if(inner)el.innerHTML=inner[1];
}
globalThis.window=globalThis;globalThis.innerWidth=1200;globalThis.innerHeight=800;globalThis.visualViewport={height:800};
globalThis.document={body,createElement:tag=>new El(tag),getElementById:id=>byId.get(id)||null,querySelectorAll:selector=>body.querySelectorAll(selector),addEventListener(){},documentElement:new El("html")};
const fireAdded=nodes=>observers.forEach(observer=>observer.callback([{type:"childList",addedNodes:nodes,removedNodes:[],target:nodes[0]?.parentNode}],observer));
await import("../js/ui/terminal-select.js");
await import("../js/core/map-grid.js");
await import("../js/ui/map-editor.js");
await import("../js/data/game-data.js");
await import("../js/data/offline-data.generated.js");
const {TerminalSelect,MapEditor,MapGrid}=globalThis,$=id=>document.getElementById(id);
const listOf=select=>select.parentNode.querySelector(".terminal-select-list");
const labelsOf=select=>listOf(select).querySelectorAll("button").map(button=>button.textContent);

const probe=new El("select");body.append(probe);TerminalSelect.enhance(probe);
assert.equal(listOf(probe).querySelectorAll("button").length,0,"空 select 增强后应无自绘选项");
probe.innerHTML='<option value="plains">平原</option><option value="ocean">海洋</option>';
fireAdded(probe.options);
assert.deepEqual(labelsOf(probe),["平原","海洋"],"外部插入 option 后自绘选项必须自动重建");
probe.replaceChildren();
assert.equal(probe.querySelectorAll("option").length,0);

const state={data:globalThis.SANGUO_DATA},instance=MapEditor.install({$,state,getData:()=>state.data,mapView:{routes:[],waterways:[],landmarks:[],refreshSupply(){}},toast:()=>{},downloadJson:()=>{}});
assert.ok(instance,"舆图编辑器必须能在真实数据下安装");
instance.open();
const valueSelect=$("mapEditorValue"),terrainOptions=valueSelect.options.map(option=>option.value);
assert.ok(terrainOptions.length>0,"地形笔刷取值不得为空");
assert.deepEqual(labelsOf(valueSelect).length,terrainOptions.length,"笔刷取值自绘下拉必须与原生选项同步（曾出现空白下拉）");
assert.ok(labelsOf(valueSelect).every(label=>label),"笔刷取值自绘下拉不得出现空选项");
assert.equal(labelsOf(valueSelect)[0],valueSelect.options[0].textContent,"自绘下拉首项应与原生选项一致");
assert.ok(labelsOf(valueSelect).includes("平原"),"已登记地形应使用中文名称");
assert.equal(valueSelect.value,instance.editor.dominant("terrain"),"首次打开应默认最常见地形取值");
assert.deepEqual(labelsOf($("mapEditorCity")).length,$("mapEditorCity").options.length,"据点下拉必须与选项同步");
assert.ok(labelsOf($("mapEditorCity")).length>0,"据点下拉不得为空");
assert.deepEqual(labelsOf($("mapEditorCityForce")).length,$("mapEditorCityForce").options.length,"势力下拉必须与选项同步");
$("mapEditorLayer").value="commandery";$("mapEditorLayer").onchange();
const commanderyOptions=$("mapEditorValue").options.map(option=>option.value);
assert.deepEqual(labelsOf($("mapEditorValue")),commanderyOptions,"切换图层后笔刷取值自绘下拉必须重建");
assert.deepEqual(labelsOf($("mapEditorRoadFrom")).length,$("mapEditorRoadFrom").options.length,"道路起点下拉必须与选项同步");
assert.equal($("mapEditorValue").value,instance.editor.dominant("commandery"),"切换图层后应回落该层最常见取值");
const painted=instance.editor.valueOptions("commandery").map(option=>option.value).find(value=>value!==instance.editor.commanderyAt(0,0));
$("mapEditorValue").value=painted;$("mapEditorValue").onchange?.();
$("mapEditorFill").onclick();
$("mapEditorFill").onclick();
assert.equal(instance.editor.commanderyAt(0,0),painted,"自绘下拉选定值必须驱动笔刷");
assert.equal(MapGrid.decode(MapGrid.encode(instance.editor.terrain),instance.editor.terrain.length).length,instance.editor.terrain.length);

console.log(`舆图编辑器下拉同步通过：空下拉增强后自动重建 / 笔刷取值 ${terrainOptions.length} 项与原生选项逐项一致 / 据点与势力下拉同步 / 切换图层后重建并回落最常见取值`);
