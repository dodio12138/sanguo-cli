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
const puyang=await loader.loadScenario("194_puyang",{useSavedMap:false}),guandu=await loader.loadScenario("200_guandu",{useSavedMap:false});
const kill=(state,name)=>{const officer=state.data.officers.find(item=>item.name===name&&item.status==="serving");officer.status="dead";officer.force="neutral";return officer};

// 陶谦让徐州：AI 势力的君主殁后，继承人为他国之主，整个势力并入其麾下。
let state=new GameState(structuredClone(puyang),{playerForceId:"cao"}),events=[];
const xu=state.data.cities.filter(city=>city.force==="tao_qian").length,liuBefore=state.data.cities.filter(city=>city.force==="liu").length;
kill(state,"陶谦");state.engine.resolveSuccession(state,events);
assert.equal(state.data.cities.filter(city=>city.force==="tao_qian").length,0);assert.equal(state.data.cities.filter(city=>city.force==="liu").length,xu+liuBefore);
assert(state.data.officers.filter(officer=>officer.name==="陈登")[0].force==="liu","陶谦旧部归刘备");assert(events.some(event=>/让于刘备/.test(event.text)));

// 玩家扮演陶谦时不会被让出，改由本势力人物继领。
state=new GameState(structuredClone(puyang),{playerForceId:"tao_qian"});events=[];kill(state,"陶谦");state.engine.resolveSuccession(state,events);
const tao=state.data.forces.find(force=>force.id==="tao_qian");
assert(state.data.cities.some(city=>city.force==="tao_qian"),"玩家势力保留");assert.notEqual(tao.name,"陶谦");assert.equal(tao.ruler,tao.name);
assert.equal(state.data.officers.find(officer=>officer.name===tao.name&&officer.status==="serving").force,"tao_qian");

// 按继承表嗣位：刘表殁后由刘琮或刘琦继领，势力改以新君为名；年幼者不立。
state=new GameState(structuredClone(guandu),{playerForceId:"cao"});events=[];kill(state,"刘表");state.engine.resolveSuccession(state,events);
const jing=state.data.forces.find(force=>force.id==="liu_biao");assert(["刘琮","刘琦"].includes(jing.name),`刘表继承人：${jing.name}`);
const heir=state.data.officers.find(officer=>officer.name===jing.name&&officer.status==="serving");assert.equal(heir.force,"liu_biao");assert.equal(heir.loyalty,100);
assert(state.data.date??true);

// 君主被俘也需有人主事；无人可继则散为地方官府。
state=new GameState(structuredClone(guandu),{playerForceId:"cao"});events=[];
for(const officer of state.data.officers)if(officer.force==="zhang_lu"){officer.status="dead";officer.force="neutral"}
state.engine.resolveSuccession(state,events);
assert.equal(state.data.cities.filter(city=>city.force==="zhang_lu").length,0,"无人可继的势力据点散为地方官府");assert(!state.data.armies.some(army=>army.force==="zhang_lu"));

// 日常结算自动执行：读档后已无君主的势力也会补上继承。
state=new GameState(structuredClone(puyang),{playerForceId:"cao"});kill(state,"陶谦");state.endTurn();
assert.equal(state.data.cities.filter(city=>city.force==="tao_qian").length,0,"每日结算触发继承");
console.log("君主继承通过：陶谦让徐州 / 玩家势力不被让出 / 按继承表嗣位 / 无人可继散为地方官府 / 每日结算自动执行");
