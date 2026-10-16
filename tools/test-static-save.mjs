import assert from "node:assert/strict";
globalThis.window=globalThis;
globalThis.CustomEvent??=class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import("../js/data/offline-data.generated.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");
const slots=new Map();globalThis.localStorage={getItem:k=>slots.get(k)??null,setItem:(k,v)=>slots.set(k,String(v)),removeItem:k=>slots.delete(k)};
globalThis.location={protocol:"https:",hostname:"dodio12138.github.io"};
let requests=0;globalThis.fetch=async()=>{requests++;return {ok:true}};
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});
assert.equal(GameState.hostSaveAvailable(),false);assert(state.save("manual","2"));await state.flushPersistence();assert.equal(requests,0);
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});assert(restored.loadSafely("2"));assert.equal(restored.turn,state.turn);
// 人物编辑改过的名、生卒等静态字段随档保存；未改动的人物不写这些字段。
{const [edited,plain]=state.data.officers;edited.name=`${edited.name}改`;edited.birthYear=(edited.birthYear||160)-1;const packed=JSON.parse(JSON.stringify(state.serialize()));assert.deepEqual(Object.keys(packed.world.officers.find(o=>o.id===edited.id).staticEdits).sort(),["birthYear","name"]);assert.equal(packed.world.officers.find(o=>o.id===plain.id).staticEdits,undefined,"未改动人物不存静态字段");
  const again=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});again.applySave(again.migrateSave(packed));const back=again.data.officers.find(o=>o.id===edited.id);assert.equal(back.name,edited.name,"改名读档后保留");assert.equal(back.birthYear,edited.birthYear);assert.equal(back.staticEdits,undefined);
  const legacy=structuredClone(packed);for(const o of legacy.world.officers){if(o.id===edited.id)o.name="旧档残名";delete o.staticEdits}const old=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});old.applySave(old.migrateSave(legacy));assert.equal(old.data.officers.find(o=>o.id===edited.id).name,plain&&SANGUO_DATA.officers.find(o=>o.id===edited.id).name,"旧档仍以基础名册为准")}
state.turn+=1;assert(state.save("auto","2"));assert(slots.has("sanguo-cli.slot.2.backup"));
location.hostname="game.example.com";globalThis.SANGUO_RUNTIME={staticHosting:true};assert.equal(GameState.hostSaveAvailable(),false);
localStorage.setItem=()=>{throw new DOMException("Quota exceeded","QuotaExceededError")};
assert.equal(state.save("manual","2"),false);await assert.rejects(state.flushPersistence(),/尚未保存/);assert.equal(requests,0);
delete globalThis.SANGUO_RUNTIME;location={protocol:"http:",hostname:"127.0.0.1"};assert.equal(GameState.hostSaveAvailable(),true);
assert(state.save("manual","2"));await state.flushPersistence();assert.equal(requests,1);
fetch=async()=>({ok:false});state.save("manual","2");await assert.rejects(state.flushPersistence());
console.log("静态存档通过：Pages/自定义域无 API 请求 / 浏览器读写与备份 / 人物编辑静态字段随档 / 配额失败不报成功 / 本地服务保留 / 主机失败可见");
