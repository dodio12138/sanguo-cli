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
    this.nodeType=1;this.tagName=String(tag).toUpperCase();this.id="";this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this._classes=new Set();this._value="";this.textContent="";this.hidden=false;this.disabled=false;this.checked=false;this.open=false;this.selectedIndex=0;this._listeners={};
    this.style={removeProperty(){},setProperty(){}};
    this.classList={add:(...names)=>names.forEach(name=>this._classes.add(name)),remove:(...names)=>names.forEach(name=>this._classes.delete(name)),contains:name=>this._classes.has(name),toggle:(name,force)=>{const on=force===undefined?!this._classes.has(name):!!force;on?this._classes.add(name):this._classes.delete(name);return on}};
  }
  get options(){return this.children.filter(child=>child.tagName==="OPTION")}
  set innerHTML(html){this.replaceChildren(...parseHtml(html));this.selectedIndex=0;this._value=this.options[0]?.value??""}
  get value(){return this._value}
  set value(next){this._value=String(next??"");const index=this.options.findIndex(option=>option.value===this._value);if(index>=0)this.selectedIndex=index}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==="value")this._value=String(value);if(name==="checked")this.checked=true}
  getAttribute(name){return this.attrs[name]??null}
  hasAttribute(name){return name in this.attrs}
  append(...nodes){nodes.forEach(node=>{node.parentNode=this;this.children.push(node)})}
  replaceChildren(...nodes){this.children=[];this.append(...nodes)}
  addEventListener(type,handler){(this._listeners[type]??=[]).push(handler)}
  dispatchEvent(event){(this._listeners[event.type]||[]).forEach(handler=>handler(event));return true}
  click(){this.dispatchEvent({type:"click",target:this})}
  showModal(){this.open=true}
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,right:560,bottom:448,width:560,height:448}}
  closest(selector){let node=this;while(node){if(matchesOne(node,selector))return node;node=node.parentNode}return null}
  matches(selector){return split(selector).some(item=>matchesOne(this,item))}
  querySelectorAll(selector){return descendants(this).filter(node=>split(selector).some(item=>matchesOne(node,item)))}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
}
const recorder=()=>{
  const calls=[],target={strokeStyle:"",fillStyle:"",lineWidth:1,font:"",textAlign:"",lineJoin:"",globalAlpha:1};
  const ctx=new Proxy(target,{get:(store,key)=>key in store?store[key]:(...args)=>{calls.push({method:key,args,strokeStyle:store.strokeStyle,fillStyle:store.fillStyle,textAlign:store.textAlign,text:String(args[0]??"")})},set:(store,key,value)=>{store[key]=value;return true}});
  return {ctx,calls};
};
const strokesWith=(calls,color)=>calls.filter(call=>call.method==="stroke"&&call.strokeStyle===color);
const fillsWith=(calls,color)=>calls.filter(call=>call.method==="fill"&&call.fillStyle===color);
const textWith=(calls,color)=>calls.filter(call=>call.method==="fillText"&&call.fillStyle===color);
const cityLabels=calls=>calls.filter(call=>call.method==="fillText"&&["甲城","乙城"].includes(call.text));

globalThis.window=globalThis;globalThis.innerWidth=1200;globalThis.innerHeight=800;globalThis.visualViewport={height:800};
const body=new El("body"),dialog=new El("dialog"),byId=new Map(),canvasCtx=new Map();
dialog.id="mapEditorDialog";body.append(dialog);byId.set("mapEditorDialog",dialog);
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const dialogHtml=html.slice(html.indexOf('id="mapEditorDialog"'),html.indexOf('id="eventDialog"'));
const selectIds=new Set(["mapEditorLayer","mapEditorValue","mapEditorCity","mapEditorCityForce","mapEditorRoadFrom","mapEditorRoadTo"]);
let elementsHost=null;
for(const match of dialogHtml.matchAll(/<(\w+)((?:[^>"]|"[^"]*")*?)>/g)){
  const id=/ id="([A-Za-z0-9_]+)"/.exec(match[2])?.[1];
  if(!id)continue;
  const el=new El(match[1]);
  for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))if(attr[1]!=="id")el.setAttribute(attr[1],attr[2]??"");
  el.id=id;byId.set(id,el);
  if(id==="mapEditorElements"){elementsHost=el;dialog.append(el);continue}
  const owner=el.hasAttribute("data-editor-element")&&elementsHost?elementsHost:dialog;
  owner.append(el);
  const inner=selectIds.has(id)?new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`).exec(dialogHtml):null;
  if(inner)el.innerHTML=inner[1];
  if(el.tagName==="CANVAS"){const {ctx,calls}=recorder();canvasCtx.set(id,{ctx,calls});el.getContext=()=>ctx}
}
globalThis.document={body,createElement:tag=>new El(tag),getElementById:id=>byId.get(id)||null,querySelectorAll:selector=>body.querySelectorAll(selector),addEventListener(){},documentElement:new El("html")};
const fakeViewport=new El("div");fakeViewport.classList.add("map-editor-viewport");fakeViewport.clientWidth=560;fakeViewport.clientHeight=448;fakeViewport.scrollLeft=0;fakeViewport.scrollTop=0;
const mapCanvas=byId.get("mapEditorCanvas"),originalClosest=mapCanvas.closest.bind(mapCanvas);mapCanvas.closest=selector=>selector===".map-editor-viewport"?fakeViewport:originalClosest(selector);
await import("../js/core/map-grid.js");
await import("../js/ui/map-editor.js");
const {MapGrid,MapEditor}=globalThis,$=id=>document.getElementById(id);

const fixture={
  map:{id:"elements",type:"map",width:8,height:8,terrain:MapGrid.encode(new Array(64).fill("plains"))},
  terrainDefs:{plains:{name:"平原",color:"#5a6b3a"},mountain:{name:"山地",color:"#5b5148"}},
  forces:[{id:"cao",name:"曹营"}],
  cities:[{id:"a",name:"甲城",type:"city",force:"cao",x:1,y:1,population:12000,garrison:800,commandery:"陈留"},
    {id:"b",name:"乙城",type:"city",force:"cao",x:6,y:1,population:9000,garrison:500,commandery:"陈留"}],
  counties:[{id:"q1",name:"陈留",x:1,y:1,capital:1,rank:"county",commandery:"陈留",jurisdictionCityId:"a"},
    {id:"q2",name:"洛阳",x:5,y:5,rank:"county",commandery:"洛阳",jurisdictionCityId:"b"}],
  rules:{city_graph:{a:["b"],b:["a"]}},
  mapWaterways:[]
};
fixture.map.waterways=[{name:"黄河",points:[[0,3],[3,3],[6,4]]}];
fixture.map.landmarks=[{name:"太行山",x:2,y:6,type:"mountain"}];

const state={data:fixture};
const instance=MapEditor.install({$,state,getData:()=>state.data,mapView:{routes:[],waterways:[],landmarks:[],refreshSupply(){}},toast:()=>{},downloadJson:()=>{}});
assert.ok(instance,"舆图编辑器必须能在桩 DOM 下安装");
const {calls}=canvasCtx.get("mapEditorCanvas");
const keys=["grid","cities","roads","counties","waterways","landmarks"];
const inputs=new Map(keys.map(key=>[key,$(`mapEditorElement${key[0].toUpperCase()}${key.slice(1)}`)]));
assert.equal(inputs.get("grid").tagName,"INPUT","网格应为真实勾选框");
for(const [key,input] of inputs){assert.ok(input,"缺少显示元素勾选框："+key);assert.equal(input.getAttribute("data-editor-element"),key,`勾选框必须标注元素键 ${key}`)}
const checkedOf=()=>Object.fromEntries(keys.map(key=>[key,inputs.get(key).checked]));
const presetsOf=()=>instance.editor&&checkedOf();
const draw=()=>{calls.length=0;instance.refresh();return calls};

instance.open();
assert.equal($("mapEditorZoomValue").textContent,"适配","地图初始应适配编辑区域");
assert.ok(parseFloat(mapCanvas.style.width)<=fakeViewport.clientWidth&&parseFloat(mapCanvas.style.height)<=fakeViewport.clientHeight,"适配应让整张舆图同时落在视口宽高内");
$("mapEditorZoomIn").onclick();assert.equal($("mapEditorZoomValue").textContent,"125%","放大按钮应逐档放大地图");
$("mapEditorZoomOut").onclick();assert.equal($("mapEditorZoomValue").textContent,"适配","缩小按钮应恢复适配比例");
$("mapEditorZoomFit").onclick();assert.equal($("mapEditorZoomValue").textContent,"适配","适配按钮应恢复窗口适配");
$("mapEditorLayer").value="province";$("mapEditorLayer").onchange();assert.equal($("mapEditorRegionNameRow").hidden,false,"编辑州域时应显示新增区域入口");assert.equal($("mapEditorRegionActions").hidden,false,"编辑州域时应显示连片区域工具");$("mapEditorRegionName").value="新州";$("mapEditorAddRegion").onclick();assert.equal($("mapEditorValue").value,"新州","新增州名应加入笔刷取值并立即选中");$("mapEditorLayer").value="commandery";$("mapEditorLayer").onchange();assert.equal($("mapEditorRegionNameRow").hidden,false,"编辑郡域时也应显示区域编辑工具");$("mapEditorLayer").value="province";$("mapEditorLayer").onchange();assert.equal([...$("mapEditorValue").options].some(option=>option.value==="新州"),true,"切换图层后新增区域仍应可选");$("mapEditorLayer").value="terrain";$("mapEditorLayer").onchange();
$("mapEditorPanToggle").onclick();const beforePan=[fakeViewport.scrollLeft,fakeViewport.scrollTop];mapCanvas.dispatchEvent({type:"pointerdown",pointerId:77,button:0,clientX:100,clientY:100,preventDefault(){}});mapCanvas.dispatchEvent({type:"pointermove",pointerId:77,clientX:80,clientY:75});assert.deepEqual([fakeViewport.scrollLeft,fakeViewport.scrollTop],[beforePan[0]+20,beforePan[1]+25],"拖动地图应只平移独立地图视口");mapCanvas.dispatchEvent({type:"pointerup",pointerId:77});$("mapEditorPanToggle").onclick();
assert.deepEqual(checkedOf(),{grid:true,cities:true,roads:false,counties:false,waterways:true,landmarks:true},"图层工具默认只显示网格/水道/地标/据点");
let drawn=draw();
assert.ok(strokesWith(drawn,"rgba(0,0,0,.32)").length>0,"图层工具应绘制网格");
assert.ok(strokesWith(drawn,"#4f9bbd").length>0,"图层工具应绘制水道");
assert.ok(textWith(drawn,"#c9c19c").some(call=>call.text==="太行山"),"图层工具应绘制地标名称");
assert.equal(cityLabels(drawn).length,2,"图层工具应绘制据点名称");
assert.equal(strokesWith(drawn,"#e7c463").length,0,"图层工具不应叠加道路");
assert.equal(fillsWith(drawn,"#9f9a7c").length,0,"图层工具不应叠加县治");

$("mapEditorToolRoad").onclick();
assert.deepEqual(checkedOf(),{grid:true,cities:true,roads:true,counties:false,waterways:false,landmarks:false},"道路工具只显示网格/据点/道路");
drawn=draw();
assert.equal(strokesWith(drawn,"#e7c463").length,0,"道路工具不得自动替玩家决定道路走向");
assert.equal(strokesWith(drawn,"#4f9bbd").length,0,"道路工具不应再显示水道");
assert.equal(textWith(drawn,"#c9c19c").length,0,"道路工具不应再显示地标");

$("mapEditorRoadFrom").value="a";$("mapEditorRoadTo").value="b";$("mapEditorRoadFrom").onchange();
$("mapEditorRoadDraw").onclick();
const clickCell=(x,y)=>$("mapEditorCanvas").dispatchEvent({type:"pointerdown",pointerId:1,clientX:x*70+35,clientY:y*56+28});
for(let x=2;x<=6;x++)clickCell(x,1);
$("mapEditorRoadFinish").onclick();
drawn=draw();assert.ok(strokesWith(drawn,"#fff0ab").length>0,"保存的逐格路线应选中并高亮绘制出来");

inputs.get("cities").checked=false;inputs.get("cities").onchange();
assert.deepEqual(checkedOf(),{grid:true,cities:false,roads:true,counties:false,waterways:false,landmarks:false},"手动取消据点后应只影响当前工具");
drawn=draw();
assert.equal(cityLabels(drawn).length,0,"手动取消耗点后不得再绘制据点名称");
$("mapEditorRoadFrom").value="a";$("mapEditorRoadTo").value="b";$("mapEditorRoadFrom").onchange();
$("mapEditorRoadDraw").onclick();clickCell(2,1);
drawn=draw();
assert.ok(strokesWith(drawn,"#f0cf7d").length>0,"手绘路径预览属于交互反馈，隐藏道路后仍应显示");

$("mapEditorToolLayer").onclick();
assert.equal(checkedOf().cities,true,"切回图层工具应恢复该工具自己的显示设置");
assert.equal(checkedOf().roads,false,"图层工具的道路开关应与道路工具互相独立");
$("mapEditorToolRoad").onclick();
assert.equal(checkedOf().cities,false,"再次进入道路工具应记住手动取消的据点");
$("mapEditorToolCity").onclick();
assert.deepEqual(checkedOf(),{grid:true,cities:true,roads:false,counties:true,waterways:false,landmarks:false},"据点工具只显示网格/据点/县治");
drawn=draw();
assert.ok(fillsWith(drawn,"#9f9a7c").length>0,"据点工具应绘制县治");
assert.equal(strokesWith(drawn,"#4f9bbd").length,0,"据点工具不应叠加水道");
inputs.get("waterways").checked=true;inputs.get("waterways").onchange();
drawn=draw();
assert.ok(strokesWith(drawn,"#4f9bbd").length>0,"手动勾选后据点工具可补充显示水道");
$("mapEditorToolCity").onclick?.();
$("mapEditorToolLayer").onclick();
assert.equal(checkedOf().waterways,true,"图层工具默认显示水道");
assert.equal(presetsOf().cities,true,"图层工具默认显示据点");

console.log("舆图编辑器显示元素通过：三工具默认元素 / 道路逐格手绘及预览 / 手动勾选按工具记忆");
