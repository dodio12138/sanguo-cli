import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.innerWidth=800;globalThis.innerHeight=600;
const globalListeners={};globalThis.addEventListener=(name,fn)=>globalListeners[name]=fn;
await import('../js/ui/desktop-context-menu.js');
const listeners={};let document;
class Element{
  children=[];style={};hidden=false;open=false;attributes={};disabled=false;isConnected=true;
  setAttribute(name,value){this.attributes[name]=value}
  append(node){this.children.push(node)}
  replaceChildren(){this.children=[]}
  matches(){return this.open}
  showPopover(){this.open=true}
  hidePopover(){this.open=false}
  focus(){document.activeElement=this}
  contains(node){return node===this||this.children.includes(node)}
  getBoundingClientRect(){return {width:160,height:120}}
  querySelectorAll(){return this.children.filter(node=>node.tag==='button'&&!node.disabled)}
  querySelector(){return this.querySelectorAll()[0]}
  addEventListener(){}
}
document={body:new Element,activeElement:new Element,createElement:tag=>Object.assign(new Element,{tag}),addEventListener:(name,fn)=>listeners[name]=fn};
document.body.classList={contains:()=>true};
let actions=0;
const {menu}=DesktopContextMenu.bind({document,itemsFor:()=>[{label:'打开',run:()=>actions++},{separator:true},{label:'已存在',disabled:true,run:()=>actions++}]});
const right=target=>{const event={target,clientX:799,clientY:599,preventDefault(){this.defaultPrevented=true}};listeners.contextmenu(event);return event};
assert(right({closest:()=>null}).defaultPrevented);assert(menu.open);assert.equal(menu.style.left,'636px');assert.equal(menu.style.top,'476px');
assert.equal(document.activeElement,menu.children[0]);menu.children[0].onclick();assert.equal(actions,1);assert(menu.hidden);assert(!menu.open);
right({closest:()=>null});let stopped=false;listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true}});assert(menu.hidden);assert(stopped,'Esc 不可同时关闭另一个窗口');
const native=right({closest:()=>({})});assert(!native.defaultPrevented,'编辑字段保留原生右键');
right({closest:()=>null});listeners.pointerdown({target:{}});assert(menu.hidden);
right({closest:()=>null});globalListeners.resize();assert(menu.hidden);
console.log('右键菜单通过：原生编辑避让、屏幕边缘定位、点击执行、禁用条目、Esc 防串联关闭、外部点击与窗口变化关闭');
