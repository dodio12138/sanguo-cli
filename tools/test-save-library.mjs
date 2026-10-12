import assert from "node:assert/strict";
globalThis.window=globalThis;
globalThis.CustomEvent??=class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const slots=new Map();globalThis.localStorage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>slots.set(key,String(value)),removeItem:key=>slots.delete(key),get length(){return slots.size},key:index=>[...slots.keys()][index]};
await import("../js/core/save-library.js");
const legacy={scenarioId:"200_guandu",turn:8,savedAt:"2026-10-01T00:00:00Z"};localStorage.setItem("sanguo-cli.slot.1",JSON.stringify(legacy));localStorage.setItem("sanguo-cli.slot.9",JSON.stringify({...legacy,turn:9}));await SaveLibrary.initialize();
assert.deepEqual(SaveLibrary.ids(),["1","9"]);assert.equal(SaveLibrary.get("1").turn,8);const ids=new Set(Array.from({length:50},()=>SaveLibrary.newId()));assert.equal(ids.size,50);for(const id of ids)assert(SaveLibrary.validId(id));assert(!SaveLibrary.validId("__proto__"));
await import("../js/data/offline-data.generated.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");
globalThis.location={protocol:"https:",hostname:"example.github.io"};
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});state.saveName="测试档案";const id=SaveLibrary.newId();state.save("initial",id);await state.flushPersistence();assert.equal(SaveLibrary.get(id).saveName,"测试档案");state.turn=13;state.save("auto");await state.flushPersistence();assert.equal(state.saveSlot,id);assert.equal(SaveLibrary.get(id).turn,13);assert.equal(SaveLibrary.get("1").turn,8);
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});assert(restored.loadSafely(id));assert.equal(restored.saveName,"测试档案");assert.equal(restored.turn,13);
// Simulate a committed browser-database save with localStorage at quota.
SaveLibrary.database={};SaveLibrary.put=async(slot,snapshot)=>{SaveLibrary.remember(slot,structuredClone(snapshot));return true};localStorage.setItem=()=>{throw new DOMException("quota","QuotaExceededError")};state.turn=14;state.save("auto");await state.flushPersistence();assert.equal(state.persistenceWarning,"");assert.equal(SaveLibrary.get(id).turn,14);
SaveLibrary.put=async()=>false;slots.set(`sanguo-cli.slot.${id}`,"{broken");slots.set(`sanguo-cli.slot.${id}.backup`,JSON.stringify(legacy));state.save("auto");await assert.rejects(state.flushPersistence(),/尚未保存/);assert.equal(JSON.parse(slots.get(`sanguo-cli.slot.${id}.backup`)).turn,8);
globalThis.location={protocol:"http:",hostname:"localhost"};globalThis.fetch=async()=>({ok:true});let falseAlarms=0;state.addEventListener("persistence",event=>{if(!event.detail.ok)falseAlarms++});state.save("auto");await state.flushPersistence();assert.equal(falseAlarms,0);assert.equal(state.persistenceWarning,"");
assert.equal(JSON.parse(slots.get("sanguo-cli.slot.1")).turn,8);
console.log("存档库通过：旧档发现 / 50 个独立编号 / 自动保存留在当前档案 / 命名恢复 / 浏览器配额降级 / 双路径失败可见 / 服务成功不误报");
