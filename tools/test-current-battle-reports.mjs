// 当前资料窗不混入同城旧战事，保留本场之前各日战报；档案源不删。
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let factory;const state={turn:21,data:{cities:[{id:'c',siegeStartedTurn:18,siegeTurns:.3}],armies:[]},reports:[],addEventListener(){}},app={state,$:()=>({addEventListener(){}})},context={SanguoApp:{define(n,f){factory=f}}};vm.runInNewContext(fs.readFileSync(new URL('../js/ui/app/battle-detail.js',import.meta.url),'utf8'),context);const {currentBattleEvents:events}=factory(app);
const event=(phase,battleId,text,siteId='c')=>({phase,battleId,text,siteId});
state.reports=[{turn:20,events:[event('野战','new','今日交锋'),event('人物','new','今日伤员')]},{turn:19,events:[event('野战','new','昨日交锋')]},{turn:5,events:[event('野战','old','旧战役')]}];state.data.armies=[{engagement:{id:'new',siteId:'c',startedTurn:18}}];const source=JSON.stringify(state.reports);
assert.deepEqual(Array.from(events('c',['野战','人物']),e=>e.text),['昨日交锋','今日交锋','今日伤员']);assert.equal(JSON.stringify(state.reports),source,'历史档案不删');
state.data.armies=[{engagement:{id:'next',siteId:'c',startedTurn:21}}];assert.equal(events('c',['野战','人物']).length,0,'新战斗尚无战报时不回退显示旧战');
state.data.armies=[];assert.equal(events('c',['野战']).length,2,'刚结束的本场完整过程可看');state.turn=22;assert.equal(events('c',['野战']).length,0,'无当前战事不显示陈旧记录');
state.turn=21;state.data.armies=[{siegeTarget:'c'}];state.reports=[{turn:20,events:[event('攻城','siege:c:enemy:18','本期围城')]},{turn:19,events:[event('攻城','siege:c:enemy:18','上期围城')]},{turn:5,events:[event('攻城','siege:c:enemy:1','上次围城')]}];assert.deepEqual(Array.from(events('c',['攻城','守城','战斗','人物']),e=>e.text),['上期围城','本期围城']);
state.data.cities[0].siegeStartedTurn=21;assert.equal(events('c',['攻城']).length,0,'重新围城不会继承前一次记录');
state.data.cities[0].siegeStartedTurn=1;state.turn=41;state.reports=Array.from({length:40},(_,i)=>({turn:40-i,events:[event('攻城','siege:c:enemy:1',`本次围城第${40-i}日`)]}));assert.equal(events('c',['攻城']).length,40,'长围城完整保留，不限最近12／14期');
assert(!fs.readFileSync(new URL('../js/ui/app/battle-detail.js',import.meta.url),'utf8').includes('log.slice(-12)'),'展示层不截断本场记录');
console.log('当前战报通过：本次围城／野战完整过程，隔离上次战役，结束战斗完整可看，长围城不截断，旧档案保留');
