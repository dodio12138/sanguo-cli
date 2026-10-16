import assert from "node:assert/strict";
import fs from "node:fs";
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(String(url),"utf8"))});
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const name of ["data-loader","map-grid","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${name}.js`);
await import("../js/data/offline-data.generated.js");await import("../js/ui/command-ui.js");
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});const source=await loader.loadScenario("200_guandu",{useSavedMap:false}),g=new GameState(structuredClone(source),{playerForceId:"cao"}),e=g.engine;
// 独立测试局令曹方据有青州，验证真正下诏而非直接写官制数据。
for(const city of g.data.cities.filter(c=>c.province==="青州"))city.force="cao";
const governor=g.data.officers.find(o=>o.name==="曹仁"),next=g.data.officers.find(o=>o.name==="贾诩"),seat=g.data.cities.find(c=>c.province==="青州"&&!c.countyNode);
assert(seat);e.detachOfficerFromArmy(governor);governor.city=seat.id;const assigned=e.assignCityAdministration(seat.id,{commanderyGovernor:governor.id});assert(assigned.ok,assigned.error);const jun=e.commandPosts(g,"cao").find(p=>p.kind==="jun"&&p.scope.commanderies.includes(seat.commandery));assert(jun);
const beforeMap=JSON.stringify(g.data.map),rng=g.rngState;let result=e.issueEdict(g,"cao","appoint",{officerId:governor.id,office:"zhoumu",seat:"青州"});assert(result.accepted,result.error||result.text);
let post=e.commandPosts(g,"cao").find(p=>p.courtProvince==="青州");assert(post);assert.equal(post.title,"青州牧");assert.equal(post.holderId,governor.id);assert.equal(jun.parentId,post.id);assert(CommandUI.chart(g).includes('青州牧'));assert(CommandUI.chart(g).includes(`data-post-select="${post.id}"`));
const id=post.id;post.policy={type:"develop",targetCityId:null};assert(e.reparentPost(g,"cao",jun.id,null).ok);e.synchronizeProvincePosts(g);assert.equal(post.id,id);assert.equal(jun.parentId,null,"补齐不得撤销显式划出");assert.equal(post.policy.type,"develop");
// 更换州职、人选复用原节点，保留方针、隶属与下属。
g.turn+=31;result=e.issueEdict(g,"cao","appoint",{officerId:next.id,office:"cishi",seat:"青州"});assert(result.accepted,result.error);post=e.commandOf(g,"cao").posts[id];assert.equal(post.title,"青州刺史");assert.equal(post.holderId,next.id);assert.equal(post.policy.type,"develop");assert.equal(e.commandPosts(g,"cao").filter(p=>p.courtProvince==="青州").length,1);
// 旧档缺节点时补齐，完整存档则保持节点ID与方针。
const save=structuredClone(g.serialize()),back=new GameState(structuredClone(source),{playerForceId:"cao"});back.applySave(back.migrateSave(save));assert.equal(back.forceCommand.cao.posts[id].title,"青州刺史");assert.equal(back.forceCommand.cao.posts[id].policy.type,"develop");assert.equal(back.forceCommand.cao.posts[jun.id].parentId,null);
const old=structuredClone(save);delete old.forceCommand.cao.posts[id];back.applySave(back.migrateSave(old));assert.equal(back.engine.commandPosts(back,"cao").filter(p=>p.courtProvince==="青州").length,1);back.engine.synchronizeProvincePosts(back);assert.equal(back.engine.commandPosts(back,"cao").filter(p=>p.courtProvince==="青州").length,1);
// 奉诏罢免撤销该州节点，郡守回归原上级；不扣召还忠诚。
g.turn+=31;const loyalty=next.loyalty;result=e.issueEdict(g,"cao","dismiss",{officerId:next.id,office:"cishi"});assert(result.accepted,result.error);assert(!e.commandOf(g,"cao").posts[id]);assert.equal(next.loyalty,loyalty);assert.equal(JSON.stringify(g.data.map),beforeMap);assert.equal(g.rngState,rng);
console.log("州职同步通过：真实任命青州牧 / 刺史替任 / 官制图节点 / 郡守自动隶属 / 节点及方针保留 / 显式划出保留 / 旧档幂等补齐 / 罢免同步 / 地图与随机源不变");
