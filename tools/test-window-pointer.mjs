import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
class Host extends EventTarget {
  listeners=new Set();
  addEventListener(type,fn,...args){this.listeners.add(fn);super.addEventListener(type,fn,...args)}
  removeEventListener(type,fn,...args){this.listeners.delete(fn);super.removeEventListener(type,fn,...args)}
}
const host=new Host(),document=new Host(),handle=new Host();
let capture=true;
handle.hasPointerCapture=()=>capture;
handle.releasePointerCapture=id=>{capture=false;send(handle,"lostpointercapture",{pointerId:id})};
const source=fs.readFileSync(new URL("../js/ui/os-window-manager.js",import.meta.url),"utf8");
const start=source.indexOf("function trackPointer("),end=source.indexOf("function addResizeGrip(",start);
const track=vm.runInNewContext(source.slice(start,end)+";trackPointer",{globalThis:host,document});
function send(target,type,props={}){const event=new Event(type);Object.assign(event,props);target.dispatchEvent(event)}
let moves=0,finishes=[];
const begin=()=>{capture=true;track(handle,1,()=>moves++,(event,cancelled)=>finishes.push(cancelled))};
const clean=()=>{assert.equal(handle.listeners.size,0);assert.equal(host.listeners.size,0);assert.equal(document.listeners.size,0);assert.equal(capture,false)};
begin();send(handle,"pointermove",{pointerId:2,buttons:1});assert.equal(moves,0);send(handle,"pointermove",{pointerId:1,buttons:1});assert.equal(moves,1);send(handle,"pointerup",{pointerId:1});assert.deepEqual(finishes,[false]);clean();
for(const type of ["pointercancel","lostpointercapture"]){begin();send(handle,type,{pointerId:1});clean()}
begin();send(host,"blur");clean();
begin();document.hidden=true;send(document,"visibilitychange");clean();document.hidden=false;
begin();send(handle,"pointermove",{pointerId:1,buttons:0});clean();
assert.equal(finishes.length,6);assert(finishes.slice(1).every(Boolean));
for(let i=0;i<30;i++){begin();send(handle,"pointerup",{pointerId:1});clean()}
console.log("窗口指针回归通过：正常结束 / 取消与失焦 / 指针丢失 / 松键取消 / 重复拖动监听完全清理");
