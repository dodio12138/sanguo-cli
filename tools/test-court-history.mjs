// 汉庭史事：迁都长安、天子东归、迎天子都许、袁术称帝、衣带诏、魏公魏王、汉中王、曹丕受禅、刘备称帝、孙权吴王——条件满足时改写朝局，玩家所属势力的史事留给玩家自决。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js","js/ui/court-ui.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");
const fresh=(player="cao")=>{const game=new GameState(structuredClone(scenario),{playerForceId:player});return {game,e:game.engine,court:game.court}};

const at=(game,ym)=>{const [y,m]=ym.split("-").map(Number);game.date.year=y;game.date.month=m;game.date.day=15};
const fire=(game,id)=>{const events=[];game.engine.runWorldEvents(game,events);return events.find(ev=>ev.eventId===id)};
const load=async(id,player)=>{const data=await loader.loadScenario(id),game=new GameState(structuredClone(data),{playerForceId:player||data.scenario.default_player_force});return {game,e:game.engine,court:game.court}};

// 190：迁都长安
{const {game,court}=await load("190_coalition","yuan");at(game,"190-03");for(const id of ["luoyang","changan"])game.data.cities.find(c=>c.id===id).force="dong";const ev=fire(game,"dong_moves_capital");assert(ev,"迁都长安触发");assert.equal(court.capital,"changan");console.log(ev.text)}
// 194：天子东归 → 流离；迎天子都许（曹操非玩家时）；玩家为曹操则不自动发生
{const {game,court}=await load("194_puyang","liu");at(game,"195-08");assert(fire(game,"emperor_leaves_changan"));assert.equal(court.controller,null);assert.equal(court.emperor.status,"wandering");assert.equal(court.capital,"luoyang");
  at(game,"196-08");const ev=fire(game,"cao_receives_emperor");assert(ev,"迎天子都许触发");assert.equal(court.controller,"cao");assert.equal(game.data.cities.find(c=>c.id===court.capital).force,"cao","天子迎往曹操之城");console.log(ev.text)}
{const {game,court}=await load("194_puyang","cao");at(game,"195-08");fire(game,"emperor_leaves_changan");at(game,"196-08");assert(!fire(game,"cao_receives_emperor"),"玩家为曹操时须自行奉迎");assert.equal(court.controller,null)}
// 194：袁术称帝
{const {game,e,court}=await load("194_puyang","liu");at(game,"197-02");const ev=fire(game,"yuan_shu_emperor");assert(ev);assert(court.usurpers.includes("yuan_shu"));assert.equal(e.courtNominal(game,"yuan_shu"),"自立")}
// 200：衣带诏事泄
{const {game,e,court}=await load("200_guandu","yuan");const control=court.control;at(game,"200-02");assert(fire(game,"girdle_edict"));assert(court.control>control)}
// 211：魏公、魏王、汉中王；219：曹丕受禅、刘备称帝、孙权吴王
{const {game,e,court}=await load("211_tongguan","sun");assert.equal(e.courtPromotionStep(game,"cao"),1,"开局已是丞相");at(game,"213-06");assert(fire(game,"cao_duke_of_wei"));assert(court.titles.some(t=>t.title==="gong"&&t.fief==="魏"));at(game,"216-06");assert(fire(game,"cao_king_of_wei"));assert(court.titles.some(t=>t.title==="wang"&&t.fief==="魏"));
  game.data.cities.find(c=>c.id==="commandery_city_055").force="liu";at(game,"219-08");assert(fire(game,"liu_king_of_hanzhong"));assert(court.titles.some(t=>t.title==="wang"&&t.fief==="汉中"&&t.self))}
{const {game,e,court}=await load("219_xiangyang","sun");game.observerMode=true;assert.equal(e.courtPromotionStep(game,"cao"),3,"开局已是魏王");const pi=game.data.officers.find(o=>o.name==="曹丕");pi.status="serving";pi.force="cao";const cao=game.data.officers.find(o=>o.name==="曹操");cao.status="dead";e.resolveSuccession(game,[]);e.syncCourtHoldings(game,[]);at(game,"220-11");const ev=fire(game,"cao_pi_abdication");assert(ev,"曹丕受禅");assert(court.dynasty);assert.equal(court.emperor.name,"曹丕");
  at(game,"221-05");assert(fire(game,"liu_bei_emperor"));assert(court.usurpers.includes("liu"));at(game,"221-09");assert(fire(game,"sun_quan_king_of_wu"));assert(court.titles.some(t=>t.title==="wang"&&t.fief==="吴"));console.log(ev.text)}
// 条件不合则不发生：曹操未据许、天子未流离时不迎；汉祚已终后不再加九锡
{const {game}=await load("194_puyang","liu");at(game,"196-08");assert(!fire(game,"cao_receives_emperor"),"天子未离李傕时不迎")}
console.log("汉庭史事通过：迁都长安 / 天子东归与迎天子都许 / 袁术称帝 / 衣带诏 / 魏公魏王 / 汉中王 / 曹丕受禅 / 刘备称帝 / 孙权吴王");
