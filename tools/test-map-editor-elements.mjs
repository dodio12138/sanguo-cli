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
await import("../js/ui/map-editor-reference.js");
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

await instance.open();
assert.equal($("mapEditorZoomValue").textContent,"适配","地图初始应适配编辑区域");
assert.ok(parseFloat(mapCanvas.style.width)<=fakeViewport.clientWidth&&parseFloat(mapCanvas.style.height)<=fakeViewport.clientHeight,"适配应让整张舆图同时落在视口宽高内");
$("mapEditorZoomIn").onclick();assert.equal($("mapEditorZoomValue").textContent,"125%","放大按钮应逐档放大地图");
$("mapEditorZoomOut").onclick();assert.equal($("mapEditorZoomValue").textContent,"适配","缩小按钮应恢复适配比例");
$("mapEditorZoomFit").onclick();assert.equal($("mapEditorZoomValue").textContent,"适配","适配按钮应恢复窗口适配");
const fitWidth=parseFloat(mapCanvas.style.width),fitHeight=parseFloat(mapCanvas.style.height);
for(let i=0;i<28;i++)$("mapEditorZoomIn").onclick();
assert.equal($("mapEditorZoomValue").textContent,"800%","视口应可放大到800%");
assert.equal(parseFloat(mapCanvas.style.width),fitWidth*8);assert.equal(parseFloat(mapCanvas.style.height),fitHeight*8);
$("mapEditorZoomIn").onclick();assert.equal($("mapEditorZoomValue").textContent,"800%","放大按钮不得超过800%上限");
mapCanvas.dispatchEvent({type:"wheel",ctrlKey:true,deltaY:-100,clientX:280,clientY:224,preventDefault(){}});
assert.equal($("mapEditorZoomValue").textContent,"800%","Ctrl滚轮应共享800%上限");
$("mapEditorZoomOut").onclick();assert.equal($("mapEditorZoomValue").textContent,"775%","上限处应仍能正常缩小");
$("mapEditorZoomFit").onclick();assert.equal(parseFloat(mapCanvas.style.width),fitWidth,"适配应还原，不改变网格尺寸");
$("mapEditorLayer").value="province";$("mapEditorLayer").onchange();assert.equal($("mapEditorRegionNameRow").hidden,true,"州域不提供独立区域命名");assert.equal($("mapEditorRegionActions").hidden,true,"州域不提供连片笔刷");assert.equal($("mapEditorLayerActions").hidden,true,"州域不提供填充或还原");assert.equal($("mapEditorProvinceAssignment").hidden,false,"州域提供郡属州分配入口");assert.equal($("mapEditorFill").disabled,true);$("mapEditorLayer").value="commandery";$("mapEditorLayer").onchange();assert.equal($("mapEditorRegionNameRow").hidden,false,"郡域仍可新增区域");$("mapEditorRegionName").value="新郡";$("mapEditorAddRegion").onclick();assert.equal($("mapEditorValue").value,"新郡");$("mapEditorLayer").value="terrain";$("mapEditorLayer").onchange();
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

// Quick commandery picking and both mouse buttons share the normal edit/undo pipeline.
$("mapEditorToolCommandery").onclick();
for(let y=5;y<=7;y++){instance.editor.setCommandery(5,y,"乙郡");instance.editor.setCommandery(6,y,"甲郡")}instance.refresh();
$("mapEditorValue").value="甲郡";$("mapEditorValue").onchange();
const pointer=(type,x,y,extra={})=>mapCanvas.dispatchEvent({type,pointerId:93,button:0,clientX:x*70+35,clientY:y*56+28,preventDefault(){},...extra});
const click=(x,y,extra={})=>{pointer("pointerdown",x,y,extra);pointer("pointerup",x,y,extra)};
let snapshot=instance.editor.snapshot(),historySize=instance.editor.undoStack.length;
pointer("pointermove",5,5);assert.deepEqual(instance.editor.snapshot(),snapshot,"悬浮不能取郡或绘制");
click(5,5);assert.equal($("mapEditorValue").value,"乙郡","点击县治自动选择该格所属郡");
assert.deepEqual(instance.editor.snapshot(),snapshot,"点选县治只取值，不修改地图或节点");assert.equal(instance.editor.undoStack.length,historySize);
pointer("pointerdown",6,5);pointer("pointermove",6,7);pointer("pointerup",6,7);
for(let y=5;y<=7;y++)assert.equal(instance.editor.commanderyAt(6,y),"乙郡","快拖补齐添加笔迹");
assert.equal(instance.editor.undoStack.length,historySize+1,"整笔添加只占一次撤销");
instance.editor.undo();assert.deepEqual(instance.editor.snapshot(),snapshot);
pointer("pointerdown",6,5,{button:2});pointer("pointermove",6,7,{buttons:2});pointer("pointerup",6,7,{button:2});
for(let y=5;y<=7;y++)assert.ok(instance.editor.commanderyAt(6,y)&&instance.editor.commanderyAt(6,y)!==snapshot.commanderies[y*8+6],"右键拖动应由接壤的其他郡接替，不得留空或变成左键涂绘");
assert.equal(instance.editor.undoStack.length,historySize+1);assert.deepEqual(instance.editor.terrain,snapshot.terrain);assert.deepEqual(instance.editor.provinces,snapshot.provinces);
assert.equal(instance.editor.counties.length,snapshot.counties.length);assert.equal(instance.editor.cities.length,snapshot.cities.length,"擦除区域不得删除节点");
const erased=instance.editor.snapshot();
let menuPrevented=false,menuStopped=false;mapCanvas.dispatchEvent({type:"contextmenu",preventDefault(){menuPrevented=true},stopPropagation(){menuStopped=true}});assert(menuPrevented&&menuStopped,"画布右键必须阻止浏览器菜单和全局桌面菜单抢走擦除手势");
const roundTrip=new MapEditor(fixture);roundTrip.importPatch(instance.editor.exportPatch());assert.deepEqual(roundTrip.commanderies,instance.editor.commanderies,"接替郡导出回读不能重新随机");
instance.editor.undo();assert.deepEqual(instance.editor.snapshot(),snapshot);instance.editor.redo();assert.deepEqual(instance.editor.snapshot(),erased);instance.editor.undo();
$("mapEditorPickCommandery").onclick();assert.equal($("mapEditorPickCommandery").getAttribute("aria-pressed"),"true");
click(6,5);assert.equal($("mapEditorValue").value,"甲郡");assert.equal($("mapEditorPickCommandery").getAttribute("aria-pressed"),"false","取值后自动回到涂绘");assert.deepEqual(instance.editor.snapshot(),snapshot);
click(5,5,{shiftKey:true});assert.equal(instance.editor.counties.find(county=>county.id==="q2").commandery,"甲郡","Shift 左键可改节点所在格，归属同步更新");
instance.editor.undo();assert.deepEqual(instance.editor.snapshot(),snapshot);
$("mapEditorRegionFill").checked=true;$("mapEditorBrushSize").value="3";click(6,5,{button:2});
assert.ok(instance.editor.commanderyAt(6,5));assert.notEqual(instance.editor.commanderyAt(6,5),snapshot.commanderies[5*8+6]);assert.equal(instance.editor.commanderyAt(0,0),snapshot.commanderies[0],"连片填充模式不能让右键重划整个郡");instance.editor.undo();
$("mapEditorRegionFill").checked=false;$("mapEditorBrushSize").value="1";
$("mapEditorPanToggle").onclick();click(6,5,{button:2});assert.deepEqual(instance.editor.snapshot(),snapshot,"平移模式右键不得擦除");$("mapEditorPanToggle").onclick();
for(const id of ["mapEditorToolProvince","mapEditorToolLayer","mapEditorToolCity","mapEditorToolRoad","mapEditorToolRiver"]){$(id).onclick();click(6,5,{button:2});assert.deepEqual(instance.editor.snapshot(),snapshot,"其他工具右键不得绘制或删除");}
// Reference transforms use continuous world coordinates and never edit the map.
const reference=instance.reference;assert(reference);reference.decode=async()=>({image:{width:160,height:80,close(){}},width:160,height:80});
await reference.add(new Blob(["test-image"],{type:"image/png"}));
snapshot=instance.editor.snapshot();historySize=instance.editor.undoStack.length;
assert.equal($("mapEditorReferenceControls").hidden,false);assert.equal(reference.adjusting,false,"导入后默认锁定");
$("mapEditorToolCommandery").onclick();reference.setAdjusting(true);const placementBefore={...reference.placement};
pointer("pointerdown",2,2);pointer("pointermove",4,3);pointer("pointerup",4,3);
assert.equal(reference.placement.x,placementBefore.x+2);assert.equal(reference.placement.y,placementBefore.y+1,"参考图拖动按世界格换算，不随 Canvas CSS 尺寸漂移");
assert.deepEqual(instance.editor.snapshot(),snapshot);assert.equal(instance.editor.undoStack.length,historySize,"拖底图不得消耗地图撤销记录");
click(6,5,{button:2});assert.deepEqual(instance.editor.snapshot(),snapshot,"调整底图时右键不能退让郡域");
const placementAfter={...reference.placement};pointer("pointerdown",2,2);pointer("pointermove",4,3);pointer("pointercancel",4,3);assert.deepEqual(reference.placement,placementAfter,"取消参考图拖动应还原该次位移");
mapCanvas.dispatchEvent({type:"wheel",deltaY:-100,clientX:280,clientY:224,preventDefault(){}});assert(reference.placement.scale>1,"调整模式滚轮只放大底图");assert.deepEqual(instance.editor.snapshot(),snapshot);
canvasCtx.get("mapEditorReferenceCanvas").calls.length=0;drawn=draw();
assert(canvasCtx.get("mapEditorReferenceCanvas").calls.some(call=>call.method==="drawImage"),"参考图必须绘制到独立的可见区域画布，不能随低分辨率网格放大");
assert(!drawn.some(call=>call.method==="drawImage"),"网格画布不得把原图再次缩到固定网格分辨率");
assert.equal($("mapEditorReferenceCanvas").width,560);assert.equal($("mapEditorReferenceCanvas").height,448,"底图缓冲区只分配可见视口尺寸");
const terrainCalls=canvasCtx.get("mapEditorTerrain").calls;assert(terrainCalls.some(call=>call.method==="fillRect"),"独立底层应保留不透明的地形/州郡颜色");
globalThis.devicePixelRatio=2;draw();assert.equal($("mapEditorReferenceCanvas").width,1120);assert.equal($("mapEditorReferenceCanvas").height,896,"高清屏必须按设备像素比绘制");globalThis.devicePixelRatio=1;
$("mapEditorToolProvince").onclick();assert.equal(reference.adjusting,false,"切回地图工具自动锁定底图");
assert.deepEqual(instance.editor.snapshot(),snapshot);await reference.remove();assert.equal($("mapEditorReferenceControls").hidden,true);assert.deepEqual(instance.editor.snapshot(),snapshot);
const blockedGridSnapshot=instance.editor.snapshot();$("mapEditorResize100").onclick();assert.deepEqual(instance.editor.snapshot(),blockedGridSnapshot,"进行中的路径必须阻止转换");assert.match($("mapEditorOutput").textContent,/完成并保存或取消/);$("mapEditorRoadCancel").onclick();
const oldGridSnapshot=instance.editor.snapshot();$("mapEditorResize100").onclick();assert.deepEqual(instance.editor.snapshot(),oldGridSnapshot,"首次转换点击只确认，不改地图");$("mapEditorResize100").onclick();assert.equal(instance.editor.width,100,$("mapEditorOutput").textContent);assert.equal(instance.editor.height,100);assert.equal($("mapEditorResize100").disabled,true,"已转换后禁止重复映射");$("mapEditorUndo").onclick();assert.deepEqual(instance.editor.snapshot(),oldGridSnapshot,"转换入口的撤销应还原完整旧图");assert.equal($("mapEditorResize100").disabled,false);
console.log("舆图编辑器显示与输入通过：元素记忆 / 县治点选 / 左键添加与邻郡接替 / 快拖补线 / 撤销回读 / 参考图渲染 / 拖动与滚轮缩放 / 取消还原 / 底图与地图输入隔离");
