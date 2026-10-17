import assert from "node:assert/strict";
globalThis.window=new EventTarget();globalThis.document=new EventTarget();
globalThis.ResizeObserver=class{observe(){}};
const labels={cursorInfo:{textContent:""},zoomLabel:{textContent:""}};
document.getElementById=id=>labels[id];document.hidden=false;
await import("../js/ui/map-view.js");
const canvas=new EventTarget(),captures=new Set();canvas.style={};
canvas.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:150});
canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
document.elementFromPoint=(x,y)=>x>=0&&x<200&&y>=0&&y<150?canvas:null;
const map=Object.create(window.MapView.prototype);
Object.assign(map,{canvas,frame:{},state:new EventTarget(),offset:{x:0,y:0},scale:1,drag:null,picks:0,tooltip(){},scheduleDraw(){},resize(){},draw(){},pick(){this.picks++},cellAt:()=>null});map.bind();
function pointer(type,x,y,{button=0,buttons=0,pointerId=1}={}){const e=new Event(type,{cancelable:true});Object.assign(e,{clientX:x,clientY:y,button,buttons,pointerId,isPrimary:true});canvas.dispatchEvent(e)}
pointer("pointermove",60,50);assert.deepEqual(map.offset,{x:0,y:0});assert.equal(map.picks,0);
pointer("pointerdown",20,20,{button:2,buttons:2});assert.equal(map.drag,null);
pointer("pointerdown",20,20,{buttons:1});pointer("pointerup",20,20);assert.equal(map.picks,1);assert.equal(captures.size,0);
pointer("pointerdown",20,20,{buttons:1});pointer("pointermove",60,50,{buttons:1});pointer("pointerup",60,50);assert.equal(map.picks,1);assert.deepEqual(map.offset,{x:40,y:30});
pointer("pointerdown",20,20,{buttons:1});pointer("pointerleave",30,20,{buttons:1});pointer("pointerup",600,600);assert.equal(map.picks,1);
pointer("pointerdown",20,20,{buttons:1});window.dispatchEvent(new Event("blur"));const prior={...map.offset};pointer("pointermove",70,60);assert.equal(map.drag,null);assert.deepEqual(map.offset,prior);
pointer("pointerdown",20,20,{buttons:1});pointer("pointermove",70,60);assert.equal(map.drag,null);assert.deepEqual(map.offset,prior);
for(const type of ["pointercancel","lostpointercapture"]){pointer("pointerdown",20,20,{buttons:1});pointer(type,20,20);assert.equal(map.drag,null);assert.equal(captures.size,0)}
pointer("pointerdown",20,20,{buttons:1});document.hidden=true;document.dispatchEvent(new Event("visibilitychange"));assert.equal(map.drag,null);document.hidden=false;
map.bindInput();pointer("pointerdown",20,20,{buttons:1});pointer("pointerup",20,20);assert.equal(map.picks,2); // Rebinding must not duplicate handlers.
// 滚轮：手势中只缩放旧图（不整图重画），停手后合并成一次完整重画；触控板小步也能平滑缩放。
await new Promise(r=>setTimeout(r,50));{let draws=0,scheduled=0,previews=0;Object.assign(map,{size:{w:200,h:150},draw(){draws++},scheduleDraw(){scheduled++},drawZoomPreview(){previews++;return true}});const before=map.scale;
for(let i=0;i<10;i++){const e=new Event("wheel",{cancelable:true});Object.assign(e,{deltaY:-6,deltaMode:0});canvas.dispatchEvent(e)}
assert(map.scale>before*1.05&&map.scale<before*1.1,`小步滚动平滑放大 ${map.scale}`);assert.equal(draws,0,"手势中不整图重画");await new Promise(r=>setTimeout(r,200));assert.equal(scheduled,1,"停手后只重画一次");assert(previews>=1);assert.equal(draws,0)}
map.disposeInput();assert.equal(captures.size,0);
console.log("地图输入回归通过：仅左键拖动 / 悬浮不选中 / 出界释放不点击 / 失焦与取消清理 / 松开后不粘住 / 无重复绑定 / 滚轮缩放合并重画");
