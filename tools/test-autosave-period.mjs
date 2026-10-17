// 自动存档按游戏时间分期：默认每季度末存一次，期中只记待存；可改每月、每旬等。
import assert from "node:assert/strict";
globalThis.window=globalThis;if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
await import("../js/data/offline-data.generated.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),saves=[];state.save=kind=>{saves.push({kind,date:{...state.date}});state.autosavePending=false;return true};
const at=(year,month,day)=>{state.date={...state.date,year,month,day}};
// 用前一日日期判断期末：季度末（3 月末）存，其他日只待存。
assert.equal(state.autosavePeriod??"quarter","quarter");
at(200,2,10);assert(!state.autosaveBoundary());at(200,3,GameClock.daysInMonth(200,3));assert(state.autosaveBoundary(),"三月末为季度末");
at(200,4,GameClock.daysInMonth(200,4));assert(!state.autosaveBoundary(),"四月末不是季度末");
state.autosavePeriod="month";assert(state.autosaveBoundary(),"每月：月末存档");state.autosavePeriod="xun";at(200,4,10);assert(state.autosaveBoundary());at(200,4,11);assert(!state.autosaveBoundary());
state.autosavePeriod="year";at(200,11,GameClock.daysInMonth(200,11));assert(!state.autosaveBoundary());at(200,12,GameClock.daysInMonth(200,12));assert(state.autosaveBoundary());
// 实际推进：默认每季度，跑 100 日只在季末存档，其余留待存。
state.autosavePeriod="quarter";at(200,1,1);for(let i=0;i<100;i++){state.autosaveDue=state.autosaveBoundary();state.date=GameClock.next(state.date);state.autosaveSoon()}
assert.equal(saves.length,1,`100 日内只在三月末存一次（${saves.length}）`);assert(state.autosavePending,"季中有待存，暂停或离开页面时补存");state.flushAutosave();assert.equal(saves.length,2);assert(!state.autosavePending);
console.log("自动存档分期通过：季度/月/旬/年期末判断 / 期中待存 / 补存");
