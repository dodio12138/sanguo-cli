import assert from 'node:assert/strict';
globalThis.window=globalThis;
await import('../js/core/simulation-clock.js');
const timers=new Map;let sequence=0,days=0,finish,blocked=false;
const clock=new SimulationClock({step:async()=>{days++;await new Promise(resolve=>finish=resolve)},blocked:()=>blocked,setTimer:fn=>{timers.set(++sequence,fn);return sequence},clearTimer:id=>timers.delete(id)});
async function fire(){const [id,fn]=timers.entries().next().value;timers.delete(id);return fn()}
clock.resume();clock.resume();assert.equal(timers.size,1,'继续不会启动两个计时器');
const pending=fire();assert.equal(days,1);assert(clock.busy);clock.pause();clock.resume();assert.equal(timers.size,0,'结算尚未完成时不能开始另一日');finish();await pending;assert.equal(timers.size,1);
clock.pause();assert.equal(timers.size,0);clock.resume();blocked=true;await fire();assert(clock.paused);assert.equal(days,1,'待决事件阻止日期推进');
blocked=false;clock.resume();const second=fire();clock.pause();finish();await second;assert.equal(timers.size,0,'结算中暂停后不再调度');
clock.resume();clock.setDelay(1000);assert.equal(timers.size,1);clock.pause();assert.equal(timers.size,0);
console.log('连续日模拟通过：单一计时器、异步串行、暂停取消、事件阻塞、速度切换');
