import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Host {
  handlers=new Map();
  addEventListener(type,fn){const list=this.handlers.get(type)||[];list.push(fn);this.handlers.set(type,list)}
  removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(x=>x!==fn))}
  emit(type,event={}){for(const fn of this.handlers.get(type)||[])fn(event)}
}
function control(text,rect={left:40,top:50,bottom:70}) {
  const classes=new Set();
  return {dataset:{tip:text},isConnected:true,disabled:false,rect,getAttribute(){return null},removeAttribute(){},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    closest(){return this},matches(selector){return selector===":disabled"?this.disabled:selector==="button"},
    getBoundingClientRect(){return this.rect},getClientRects(){return this.isConnected?[this.rect]:[]}};
}
const window=new Host(),document=new Host();
const tip={hidden:true,textContent:"",style:{},open:false,setAttribute(){},matches(){return this.open},showPopover(){this.open=true},hidePopover(){this.open=false},scrollWidth:100,getBoundingClientRect(){return {width:100,height:30}}};
const first=control("第一个"),second=control("第二个",{left:290,top:170,bottom:190});
// Controls have no hidden/inert ancestor.
for(const b of [first,second])b.closest=selector=>selector.includes("inert")?null:b;
document.body={};document.getElementById=()=>tip;document.querySelectorAll=()=>[];document.elementFromPoint=()=>second;document.hasFocus=()=>true;
let mutation;
class Observer{constructor(fn){mutation=fn}observe(){}disconnect(){}}
vm.runInNewContext(fs.readFileSync(new URL("../js/ui/button-feedback.js",import.meta.url),"utf8"),{window,document,MutationObserver:Observer,getComputedStyle:()=>({visibility:"visible"}),innerWidth:320,innerHeight:200});
window.ButtonFeedback.install();
const move=(target,buttons=0)=>document.emit("mousemove",{target,buttons,clientX:45,clientY:60});
move(first);assert.equal(tip.hidden,false);assert.equal(tip.textContent,"第一个");
const anchored={...tip.style};move({closest:()=>first});assert.deepEqual(tip.style,anchored);
window.emit("blur");assert.equal(tip.hidden,true);
// Regression: no new mouseover is needed after blur; moving inside restores feedback.
move(first);assert.equal(tip.hidden,false);assert(first.classList.contains("is-pointer-hover"));
document.emit("mousedown");assert.equal(tip.hidden,true);
document.emit("focusin",{target:first});assert.equal(tip.hidden,true);
move(second);assert.equal(tip.textContent,"第二个");assert.equal(first.classList.contains("is-pointer-hover"),false);
assert.equal(tip.style.left,"212px");assert.equal(tip.style.top,"133px");
second.disabled=true;move(second);assert.equal(tip.hidden,true);second.disabled=false;
move(first,1);assert.equal(tip.hidden,true); // Dragging never shows a tip.
move(first);first.isConnected=false;mutation();assert.equal(tip.textContent,"第二个");
document.emit("mouseout",{relatedTarget:null});assert.equal(tip.hidden,true);
const plain=control("");plain.closest=selector=>selector.includes("inert")?null:plain;
move(plain);assert.equal(tip.hidden,true);assert(plain.classList.contains("is-pointer-hover"));
const chrome=control("打开系统菜单");chrome.closest=selector=>selector.includes("inert")?null:chrome;
chrome.matches=selector=>selector==="button"||selector.includes(".os-start-button");
move(chrome);assert.equal(tip.hidden,true);assert(chrome.classList.contains("is-pointer-hover"));assert.equal(chrome.dataset.tip,undefined);
move(second);assert.equal(tip.hidden,false);assert.equal(tip.textContent,"第二个");
window.ButtonFeedback.install();assert.equal(document.handlers.get("mousemove").length,1);
window.ButtonFeedback.dispose();assert.equal(document.handlers.get("mousemove").length,0);
console.log("悬浮状态回归通过：失焦后移动恢复 / 子元素稳定 / 点击不触发 / 移出隐藏 / 禁用与移除 / 边界定位 / 单一控制器");
