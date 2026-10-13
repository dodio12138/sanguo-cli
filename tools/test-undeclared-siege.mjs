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
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const puyang=await loader.loadScenario("194_puyang",{useSavedMap:false});

// 行军途中目标易主：AI 军团出发时目标是中立据点，途中被玩家占取。
function setup(allied){const state=new GameState(structuredClone(puyang),{playerForceId:"liu"}),engine=state.engine,army=state.data.armies.find(item=>item.force==="tao_qian"),home=state.data.cities.find(city=>city.id===army.city);
  const target=state.data.cities.filter(city=>city.force==="neutral"&&engine.path(home.id,city.id,"tao_qian")).sort((a,b)=>engine.routeDays(engine.path(home.id,a.id,"tao_qian"))-engine.routeDays(engine.path(home.id,b.id,"tao_qian")))[0],route=engine.path(home.id,target.id,"tao_qian");
  army.route=route.slice(1);army.destination=target.id;army.stance="行军";army.legElapsed=0;target.force="liu";
  if(!allied){state.diplomacy.treaties=state.diplomacy.treaties.filter(item=>item.forceId!=="tao_qian")}
  for(let day=0;day<engine.routeDays(route,army.soldiers)+3&&army.route?.length;day++)state.endTurn();return {state,army,target}}
let {state,army,target}=setup(true);
assert.notEqual(army.siegeTarget,target.id,"盟友不会围攻玩家据点");assert(!state.diplomacy.wars.includes("tao_qian"),"盟友不因误入而开战");
assert(state.reports.some(report=>report.events.some(event=>/止步/.test(event.text))),"军团行至盟友据点前止步");
({state,army,target}=setup(false));
if(army.siegeTarget===target.id)assert(state.diplomacy.wars.includes("tao_qian"),"AI 围攻玩家据点前必须已宣战");
for(const item of state.data.armies)if(item.siegeTarget){const city=state.data.cities.find(c=>c.id===item.siegeTarget);if(city.force==="liu")assert(state.diplomacy.wars.includes(item.force),`${item.name} 未宣战即围城`)}

// 旧存档里已经出现的未宣战围城：每日结算时 AI 补宣战（玩家即可还击），盟友则撤围。
state=new GameState(structuredClone(puyang),{playerForceId:"liu"});const besieger=state.data.armies.find(item=>item.force==="lu_bu"),town=state.data.cities.find(city=>city.id==="xiaopei"),camp=(state.data.rules.city_graph[town.id]||[]).find(id=>state.data.cities.find(city=>city.id===id)?.force!=="liu")||state.data.rules.city_graph[town.id][0];besieger.city=camp;besieger.siegeTarget=town.id;besieger.siegeMethod="blockade";delete besieger.route;
state.endTurn();assert(state.diplomacy.wars.includes("lu_bu")||!besieger.siegeTarget,`未宣战围城须补宣战或撤围：${JSON.stringify({army:[besieger.city,besieger.siegeTarget,besieger.stance],town:[town.id,town.force],friendly:state.engine.worldFriendly(state,"lu_bu","liu"),ev:state.reports[0].events.filter(e=>/吕布|围/.test(e.text)).map(e=>e.text).slice(0,5)})}`);
state=new GameState(structuredClone(puyang),{playerForceId:"liu"});const ally=state.data.armies.find(item=>item.force==="tao_qian");ally.city=camp;ally.siegeTarget=town.id;ally.siegeMethod="blockade";delete ally.route;
state.endTurn();assert(!ally.siegeTarget,"盟友的围城当日撤去");assert(!state.diplomacy.wars.includes("tao_qian"));
console.log("未宣战围城修正通过：途中易主时 AI 先宣战、盟友止步 / 旧档未宣战围城补宣战或撤围");
