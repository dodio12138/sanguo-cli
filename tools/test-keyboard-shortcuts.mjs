import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window=globalThis;
await import('../js/ui/keyboard-shortcuts.js');
let blocked=false,city=true,menu=false;
const calls=[],document={activeElement:null,querySelector:()=>menu?{}:null};
const actions=Object.fromEntries(['toggle','commands','battles','reports','intelligence','help','slower','faster','city','cityCommands','march','save','close','layer'].map(name=>[name,arg=>calls.push([name,arg])]));
const handler=GameShortcuts.createHandler({document,actions,blocked:()=>blocked,citySelected:()=>city});
function press(key,options={}){const e={key,preventDefault(){this.defaultPrevented=true},...options};handler(e);return e}
assert(press(' ').defaultPrevented);assert.equal(calls.at(-1)[0],'toggle');
press(' ',{repeat:true});assert.equal(calls.length,1,'长按空格只切换一次');
const input={closest:selector=>selector.includes('input')?{}:null};
for(const key of [' ','c','F1','m'])press(key,{target:input});assert.equal(calls.length,1,'输入时不执行游戏快捷键');
document.activeElement={isContentEditable:true};press(' ');document.activeElement=null;assert.equal(calls.length,1);
press(' ',{isComposing:true});press(' ',{keyCode:229});press(' ',{ctrlKey:true});assert.equal(calls.length,1);
blocked=true;press(' ');press('m');assert.equal(calls.length,1,'编辑命令或事件抉择时禁止推进');blocked=false;
for(const [key,action] of [['C','commands'],['B','battles'],['r','reports'],['i','intelligence'],['h','help'],['[','slower'],[']','faster'],['Enter','city'],['O','cityCommands'],['m','march']]){assert(press(key).defaultPrevented);assert.equal(calls.at(-1)[0],action)}
press('F5');assert.deepEqual(calls.at(-1),['layer',4]);
let count=calls.length;city=false;press('Enter');press('o');press('m');assert.equal(calls.length,count);city=true;
press('Enter',{target:{closest:selector=>selector.includes('button')?{}:null}});assert.equal(calls.length,count,'回车保留聚焦按钮的原生动作');
press('s',{metaKey:true,target:input});assert.equal(calls.at(-1)[0],'save');
press('s',{ctrlKey:true});assert.equal(calls.at(-1)[0],'save');
count=calls.length;press('s',{ctrlKey:true,shiftKey:true});press(' ',{defaultPrevented:true});assert.equal(calls.length,count);
menu=true;press('Escape');press(' ');assert.equal(calls.length,count,'菜单/下拉框自行处理按键');menu=false;
press('Escape');assert.equal(calls.at(-1)[0],'close');
const app=fs.readFileSync(new URL('../js/ui/app.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert(app.includes('GameShortcuts.createHandler'));assert(app.includes('toggle:()=>simulation.toggle()'));
assert(html.includes('空格：暂停／继续'));assert(html.indexOf('keyboard-shortcuts.js')<html.indexOf('js/ui/app.js'));
console.log('快捷键通过：空格暂停/继续、长按防重、输入与事件保护、窗口/菜单冲突、图层与命令、变速、保存');
