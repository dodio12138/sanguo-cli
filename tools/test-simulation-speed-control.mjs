import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window=globalThis;
await import('../js/ui/simulation-speed-control.js');
class Element extends EventTarget{
  value='3000';dataset={};attributes={};innerHTML='';
  setAttribute(name,value){this.attributes[name]=value}
  dispatchEvent(event){if(event.type==='change')this.onchange?.(event);return super.dispatchEvent(event)}
}
const nodes=Object.fromEntries(['observerSpeed','observerDefaultSpeed','gameObserverSpeed','simulationSpeedButton','observerToggle'].map(id=>[id,new Element]));
const document={getElementById:id=>nodes[id]};
SimulationSpeedControl.prepare(document);
for(const id of ['observerSpeed','observerDefaultSpeed','gameObserverSpeed']){assert(nodes[id].innerHTML.includes('0.5 秒/日'));assert(!nodes[id].innerHTML.includes('5000'))}
let stopped=true,delay=3000;
nodes.observerSpeed.onchange=()=>{delay=Number(nodes.observerSpeed.value)};
const control=SimulationSpeedControl.bind({document,paused:()=>stopped});
const count=()=>[...nodes.simulationSpeedButton.innerHTML.matchAll(/<path /g)].length;
assert.equal(count(),1);assert.equal(nodes.observerToggle.attributes['aria-label'],'继续模拟');
for(const [expected,icons] of [[1000,2],[500,3],[3000,1]]){nodes.simulationSpeedButton.onclick();assert.equal(delay,expected);assert.equal(count(),icons);assert(stopped,'切换速度不能解除暂停')}
const pausedIcon=nodes.observerToggle.innerHTML;stopped=false;control.refresh();
assert.equal(nodes.observerToggle.attributes['aria-label'],'暂停模拟');assert.notEqual(nodes.observerToggle.innerHTML,pausedIcon);assert.equal(nodes.observerToggle.attributes['aria-pressed'],'true');
nodes.simulationSpeedButton.onclick();assert.equal(delay,1000);assert(!stopped,'运行中切换速度保持运行');
stopped=true;control.refresh();assert.equal(nodes.observerToggle.innerHTML,pausedIcon);assert.equal(count(),2,'暂停保留上一次速度图标');
nodes.observerSpeed.value='500';nodes.observerSpeed.dispatchEvent(new Event('change'));assert.equal(count(),3,'快捷键及设置修改速度时同步图标');assert(stopped);
assert.equal(SimulationSpeedControl.normalize(5000),3000);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),manager=fs.readFileSync(new URL('../js/ui/os-window-manager.js',import.meta.url),'utf8');
assert(!html.includes('simulationSpeedSlider'));assert(!html.includes('simulationStatus'));assert(html.includes('data-terminal-select="true" hidden'));
assert(manager.includes('dock.insertBefore(playback,clock)'),'播放器控制应放到任务栏右侧、时钟之前');
assert(nodes.observerToggle.dataset.tip.includes('空格'));assert(nodes.simulationSpeedButton.dataset.tip.includes('0.5 秒/日'));
console.log('影音式播放控制通过：右侧双图标、播放/暂停、单击循环速度、1/2/3三角图标、键盘同步、暂停状态不受换速影响');
