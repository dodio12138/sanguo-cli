// 方面辖区增减：一级方面可增辖本方州郡，不与同级重叠、不出上级；可划出与收回；郡级方面只辖一郡。
import assert from "node:assert/strict";
globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),e=state.engine,posts=()=>e.commandPosts(state,"cao");
const top=posts().find(p=>!p.parentId&&p.kind!=="jun"),jun=posts().find(p=>p.kind==="jun");assert(top&&jun,"曹操开局应有一级方面与郡级方面");
const own=[...new Set(state.data.cities.filter(c=>c.force==="cao").map(c=>c.commandery))],covered=name=>posts().some(p=>!p.parentId&&p.id!==top.id&&!e.isCivilPrefectPost(p)&&e.scopeContains(p.scope,{commandery:name,province:e.commanderyProvince(name)})),prefectOnly=name=>posts().find(p=>!p.parentId&&p.id!==top.id&&e.isCivilPrefectPost(p)&&e.scopeContains(p.scope,{commandery:name,province:e.commanderyProvince(name)}));
const free=own.find(name=>!e.scopeContains(top.scope,{commandery:name,province:e.commanderyProvince(name)})&&!covered(name)&&!prefectOnly(name));
// 增辖一个由郡太守方面单独管的郡：该郡级方面改隶本方面。
const adoptName=own.find(name=>!e.scopeContains(top.scope,{commandery:name,province:e.commanderyProvince(name)})&&!covered(name)&&prefectOnly(name));if(adoptName){const pp=prefectOnly(adoptName),r=e.adjustPostScope(state,"cao",top.id,{op:"add",kind:"commandery",name:adoptName});assert(r.ok,r.error);assert.equal(pp.parentId,top.id,"郡级方面改隶增辖的方面")}
if(free){const r=e.adjustPostScope(state,"cao",top.id,{op:"add",kind:"commandery",name:free});assert(r.ok,r.error);assert(top.scope.commanderies.includes(free),"增辖一郡");
  const back=e.adjustPostScope(state,"cao",top.id,{op:"remove",kind:"commandery",name:free});assert(back.ok,back.error);assert(!top.scope.commanderies.includes(free),"划出")}
const taken=own.find(name=>covered(name)&&!e.scopeContains(top.scope,{commandery:name,province:e.commanderyProvince(name)}));if(taken)assert(/重叠/.test(e.adjustPostScope(state,"cao",top.id,{op:"add",kind:"commandery",name:taken}).error),"与同级重叠时拒绝");
assert(/只辖一郡/.test(e.adjustPostScope(state,"cao",jun.id,{op:"add",kind:"commandery",name:own[0]}).error));
const province=top.scope.provinces?.[0];if(province){const inside=own.find(name=>e.commanderyProvince(name)===province&&!posts().some(p=>p.parentId===top.id&&e.scopeContains(p.scope,{commandery:name,province})));if(inside){assert(e.adjustPostScope(state,"cao",top.id,{op:"remove",kind:"commandery",name:inside}).ok);assert(top.scope.excludedCommanderies.includes(inside),"州内郡划出记为另行划出");assert(e.adjustPostScope(state,"cao",top.id,{op:"add",kind:"commandery",name:inside}).ok);assert(!(top.scope.excludedCommanderies||[]).includes(inside),"收回")}}
const child=posts().find(p=>p.parentId===top.id);if(child){const name=child.scope.commanderies?.[0]||e.scopeCommanderNames(child.scope)[0];assert(/下属/.test(e.adjustPostScope(state,"cao",top.id,{op:"remove",kind:"commandery",name}).error||""),"下属仍在时不能划出")}
console.log(`方面辖区增减通过：增辖 ${free||"—"} / 重叠拒绝 / 郡级方面不可增 / 州内划出与收回 / 下属保护`);
