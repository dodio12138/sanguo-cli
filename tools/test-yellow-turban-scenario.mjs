// 颍川（184）黄巾之乱：汉廷与黄巾两阵营、黄巾僭号、开局人物与军团、史实事件、存档往返；兼验各剧本史载郡守到任。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {governors} from "./roster-governors-data.mjs";

const root=fileURLToPath(new URL("..",import.meta.url)),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
globalThis.window=globalThis;globalThis.location={protocol:"http:"};
globalThis.fetch=async url=>{try{return {ok:true,status:200,json:async()=>read(String(url).replace(/^\//,""))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const file of ["data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load({useSavedMap:false});
assert(read("game/data/history/scenarios/index.json").scenarios.some(s=>s.id==="184_yingchuan"),"颍川已登记剧本目录");
const fresh=async(id,force)=>{const data=await loader.loadScenario(id,{useSavedMap:false});return new GameState(structuredClone(data),{playerForceId:force||data.scenario.default_player_force})};
const city=(g,id)=>g.data.cities.find(c=>c.id===id),person=(g,name)=>g.data.officers.find(o=>o.name===name),serving=(g,name,force)=>{const o=person(g,name);return o?.status==="serving"&&(!force||o.force===force)};
const fire=(g,date)=>{Object.assign(g.date,date);const events=[];g.engine.runWorldEvents(g,events);return events.map(e=>e.text).join("\n")};

// 1. 开局：灵帝在位，黄巾入僭号之列；地方豪强尚未独立，只有汉廷与黄巾两家
{const g=await fresh("184_yingchuan"),e=g.engine;
  assert.deepEqual(g.data.forces.map(f=>f.id).sort(),["han","neutral","zhang_jiao"]);
  assert.equal(g.court.dynasty,"汉");assert.equal(g.court.emperor.name,"刘宏");assert.equal(g.court.emperor.status,"reigning");assert.deepEqual(g.court.usurpers,["zhang_jiao"]);
  assert.deepEqual(g.court.skipped,[],"汉廷官爵全数落地");assert.deepEqual(g.forceCommandSkipped,[],"幕府方面全数落地");
  assert(g.court.offices.some(o=>o.officerId===person(g,"何进").id&&!o.self),"何进为汉廷所拜");
  for(const [id,force] of [["commandery_city_015","zhang_jiao"],["commandery_city_008","zhang_jiao"],["commandery_city_009","zhang_jiao"],["wan","zhang_jiao"],["puyang","zhang_jiao"],["ji","zhang_jiao"],["luoyang","han"],["xuchang","zhang_jiao"],["xinye","han"],["chengdu","han"],["jianye","han"]])assert.equal(city(g,id)?.force,force,`184 ${id}`);
  for(const [name,force,at] of [["刘宏","han","luoyang"],["皇甫嵩","han","commandery_city_012"],["朱儁","han","commandery_city_012"],["曹操","han","luoyang"],["卢植","han","commandery_city_021"],["刘备","han","commandery_city_088"],["张角","zhang_jiao","commandery_city_015"],["波才","zhang_jiao","commandery_city_008"],["张曼成","zhang_jiao","wan"]]){assert(serving(g,name,force),`${name} 在任于 ${force}`);assert.equal(person(g,name).city,at,`${name} 驻 ${at}`)}
  for(const name of ["张宝","张梁","波才","张曼成"])assert(person(g,name).deathYear==null,`${name} 战殁于184，卒年不作寿终`);
  for(const name of ["孙权","诸葛亮","司马懿"])assert(!serving(g,name),`${name} 尚未出仕`);
  assert.equal(g.data.armies.length,16);assert(g.data.armies.every(a=>a.commanderOfficerId),"每支军团有统帅");
  const posts=Object.values(g.forceCommand.zhang_jiao.posts).map(p=>e.postHolder(p)?.name);assert(posts.includes("波才")&&posts.includes("张曼成"),"黄巾三十六方：颍川、南阳渠帅");
  assert(e.worldWar(g,"han","zhang_jiao"),"汉与黄巾开战");
  console.log("颍川开局通过");}

// 2. 事件：长社火攻、张角病死、凉州叛乱（以汉廷视角触发，排除黄巾玩家）
{const g=await fresh("184_yingchuan","han");g.data.armies.find(a=>a.commander==="波才").city="commandery_city_008";
  const before=g.data.armies.find(a=>a.commander==="波才").soldiers;
  let text=fire(g,{year:184,month:5,day:1});assert.match(text,/长社|皇甫嵩/);assert(g.data.armies.find(a=>a.commander==="波才").soldiers<before*.5);assert.equal(city(g,"xuchang").force,"han");
  text=fire(g,{year:184,month:9});assert.match(text,/张角先已病死/);assert.equal(person(g,"张角").status,"dead");
  g.engine.resolveSuccession(g,[]);const heir=g.data.forces.find(f=>f.id==="zhang_jiao").ruler;assert(["张宝","张梁"].includes(heir),`黄巾由张角兄弟继领（${heir}）`);
  text=fire(g,{year:184,month:12});assert.match(text,/北宫伯玉/);assert.equal(city(g,"jincheng").force,"neutral");assert.equal(person(g,"韩遂").force,"neutral");
  console.log("颍川事件通过");}

// 3. 存档往返与短程推演（双方各三十日）
for(const force of ["han","zhang_jiao"]){const g=await fresh("184_yingchuan",force);g.observerMode=force==="han";for(let i=0;i<30;i++)g.endTurn();
  const save=JSON.parse(JSON.stringify(g.serialize())),restored=new GameState(structuredClone(await loader.loadScenario("184_yingchuan",{useSavedMap:false})));restored.applySave(restored.migrateSave(save));
  assert.equal(restored.court.dynasty,"汉");assert.deepEqual(restored.court.usurpers,g.court.usurpers);assert.equal(restored.turn,g.turn);
  console.log(`184 ${force} 三十日推演与存档往返通过`);}

// 4. 史载郡守：每条均落到郡治并成为该郡实际长官
for(const [id,text] of Object.entries(governors)){const g=await fresh(id),e=g.engine;
  for(const line of text.trim().split("\n")){const [seat,name]=line.split("|")[0].trim().split("=");const c=city(g,seat)||g.data.cities.find(c=>c.name===seat);assert(c,`${id} ${seat}`);
    const o=person(g,name);assert(o&&o.status==="serving"&&o.city===c.id,`${id} ${name} 驻 ${seat}`);assert.equal(o.force,c.force,`${id} ${name} 属城主势力`);
    assert.equal(e.actualCommanderyGovernor(c)?.name,name,`${id} ${name} 为${c.commandery}实际长官`)}}
{const g=await fresh("194_puyang");assert(g.court.offices.some(o=>o.officerId===person(g,"张羡").id&&o.seat==="长沙郡"),"194 长沙太守为张羡（《桓阶传》）");assert(serving(g,"韩玄"),"韩玄仍随驻长沙")}
console.log("黄巾颍川：两阵营与僭号 / 开局人物与军团 / 史实事件 / 存档往返；史载郡守到任");
