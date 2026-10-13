import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["map-grid","data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(pathToFileURL(path.join(root,`js/core/${file}.js`)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
const load=id=>loader.loadScenario(id,{useSavedMap:false});
const events=JSON.parse(fs.readFileSync(path.join(root,"game/data/common/events.json"),"utf8")).events,cityIds=new Set((await load("200_guandu")).cities.map(city=>city.id));
for(const event of events){for(const id of Object.keys(event.trigger?.cities_owned||{}))assert(cityIds.has(id),`${event.id} 引用不存在的据点 ${id}`);const actions=[...(event.world||[]),...(event.choices||[]).flatMap(choice=>choice.effect?.world||[])];for(const action of actions)for(const id of action.cities||[])assert(cityIds.has(id),`${event.id} 动作引用不存在的据点 ${id}`)}
const at=(state,year,month)=>{state.date={...state.date,year,month,day:1}};

// 开局外交：剧本写明的盟约与交战在新战局生效。
const xiangyang=await load("219_xiangyang");let state=new GameState(structuredClone(xiangyang),{playerForceId:"shi_xie"});
assert(state.engine.worldWar(state,"cao","liu"),"219 曹刘交战");assert(state.engine.worldFriendly(state,"sun","liu"),"219 孙刘尚在同盟");
const guandu=new GameState(structuredClone(await load("200_guandu")),{playerForceId:"cao"});assert(guandu.diplomacy.wars.includes("yuan"),"官渡开局曹袁交战");

// 天下大事：条件满足即生效一次；条件不合不触发。
let log=[];state.engine.runWorldEvents(state,log);assert(!log.some(e=>e.eventId==="flooding_seven_armies"),"未到秋雨时节不触发水淹七军");
at(state,219,8);const yu=state.data.armies.find(army=>army.commander==="于禁"),before=yu.soldiers;log=[];state.engine.runWorldEvents(state,log);
assert(log.some(e=>e.eventId==="flooding_seven_armies"),"八月汉水暴溢，水淹七军");assert(!state.data.armies.includes(yu)||yu.soldiers<before*.4,"七军折损");
assert.equal(state.data.officers.find(o=>o.name==="庞德").status,"dead");log=[];state.engine.runWorldEvents(state,log);assert(!log.some(e=>e.eventId==="flooding_seven_armies"),"天下大事只发生一次");
at(state,219,11);log=[];state.engine.runWorldEvents(state,log);
assert(log.some(e=>e.eventId==="white_robed_crossing"),"关羽不在江陵时吕蒙白衣渡江");assert.equal(state.data.cities.find(c=>c.id==="jiangling").force,"sun");assert(state.engine.worldWar(state,"sun","liu"),"孙刘决裂");
assert.equal(state.data.officers.find(o=>o.name==="糜芳").force,"sun");

// 关羽回守江陵则吴军无隙可乘。
state=new GameState(structuredClone(xiangyang),{playerForceId:"shi_xie"});state.data.armies.find(army=>army.commander==="关羽").city="jiangling";at(state,219,11);log=[];state.engine.runWorldEvents(state,log);
assert(!log.some(e=>e.eventId==="white_robed_crossing"));assert.equal(state.data.cities.find(c=>c.id==="jiangling").force,"liu");

// 玩家卷入时改为抉择事件，且天下大事版本不再替玩家作主。
state=new GameState(structuredClone(xiangyang),{playerForceId:"sun"});at(state,219,11);log=[];state.engine.runWorldEvents(state,log);
assert(!log.some(e=>e.eventId==="white_robed_crossing"),"玩家为孙权时不自动偷袭");state.engine.runEvent(state,log);
assert.equal(state.policies.pendingEvent?.id,"lu_meng_plan");const result=state.engine.resolveEventChoice(state,"strike");
assert(/江陵/.test(result.text));assert.equal(state.data.cities.find(c=>c.id==="jiangling").force,"sun");

// 潼关离间：联军盟约破裂；刘璋迎刘备：结盟并让出葭萌。
const tongguan=await load("211_tongguan");state=new GameState(structuredClone(tongguan),{playerForceId:"sun"});assert(state.engine.worldFriendly(state,"ma_chao","han_sui"));
at(state,211,10);log=[];state.engine.runWorldEvents(state,log);assert(!state.engine.worldFriendly(state,"ma_chao","han_sui"),"韩马离心");
at(state,212,1);log=[];state.engine.runWorldEvents(state,log);assert.equal(state.data.cities.find(c=>c.id==="jiameng").force,"liu");assert(state.engine.worldFriendly(state,"liu","liu_zhang"));

// 194 蝗灾：兖豫仓廪减少。
const puyang=await load("194_puyang");state=new GameState(structuredClone(puyang),{playerForceId:"yuan"});const yan=state.data.cities.filter(c=>c.province==="兖州"),stock=yan.reduce((n,c)=>n+c.localFood,0);at(state,194,8);log=[];state.engine.runWorldEvents(state,log);
assert(yan.reduce((n,c)=>n+c.localFood,0)<stock*.7,"蝗灾减兖州仓廪");
console.log(`剧本史实事件通过：${events.length} 条事件引用有效 / 开局外交 / 水淹七军、白衣渡江按条件触发一次 / 关羽回防则不触发 / 玩家卷入改为抉择 / 潼关离间、刘璋迎客、兴平蝗灾`);
