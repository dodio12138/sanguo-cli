// 夷陵（222）、天水（228）：汉祚终后的魏廷、三国归属、开局人物与方面、史实事件、存档往返与短程推演。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url)),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
globalThis.window=globalThis;globalThis.location={protocol:"http:"};
globalThis.fetch=async url=>{try{return {ok:true,status:200,json:async()=>read(String(url).replace(/^\//,""))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const file of ["data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load({useSavedMap:false});
const catalog=read("game/data/history/scenarios/index.json").scenarios.map(s=>s.id);
for(const id of ["222_yiling","228_tianshui"])assert(catalog.includes(id),`${id} 已登记剧本目录`);
const fresh=async(id,force)=>{const data=await loader.loadScenario(id,{useSavedMap:false});return new GameState(structuredClone(data),{playerForceId:force||data.scenario.default_player_force})};
const city=(g,id)=>g.data.cities.find(c=>c.id===id),person=(g,name)=>g.data.officers.find(o=>o.name===name),serving=(g,name,force)=>{const o=person(g,name);return o?.status==="serving"&&(!force||o.force===force)};
const fire=(g,date)=>{Object.assign(g.date,date);const events=[];g.engine.runWorldEvents(g,events);return events.map(e=>e.text).join("\n")};

// 1. 夷陵：魏廷受禅、刘备称帝在先，吴称藩受封吴王；荆州已归吴，东三郡归魏
{const g=await fresh("222_yiling"),e=g.engine;
  assert.equal(g.court.dynasty,"魏");assert.equal(g.court.emperor.name,"曹丕");assert.equal(g.court.emperor.status,"reigning");assert.deepEqual(g.court.usurpers,["liu"]);
  assert.deepEqual(g.court.skipped,[],"魏廷官爵全数落地");assert.deepEqual(g.forceCommandSkipped,[],"幕府方面全数落地");
  assert.equal(e.courtName(g),"魏廷");assert.equal(e.courtSeal(g),"魏");
  assert(g.court.titles.some(t=>t.title==="wang"&&t.fief==="吴"&&person(g,"孙权").id===t.officerId&&!t.self),"孙权受魏封吴王");
  assert(g.court.offices.some(o=>o.office==="chengxiang"&&o.self&&o.officerId===person(g,"诸葛亮").id),"诸葛亮丞相为蜀汉自署");
  for(const [id,force] of [["jiangling","sun"],["xian_extra_08","sun"],["commandery_city_125","sun"],["yiling","liu"],["commandery_city_110","liu"],["commandery_city_109","cao"],["shangyong","cao"],["xiangping","gongsun_gong"],["jiaozhi","shi_xie"],["xian_10_04","sun"]])assert.equal(city(g,id).force,force,`222 ${id}`);
  for(const [name,force,at] of [["刘备","liu","yiling"],["黄权","liu","yiling"],["冯习","liu","yiling"],["诸葛亮","liu","chengdu"],["刘禅","liu","chengdu"],["陆逊","sun","commandery_city_125"],["孙权","sun","xian_10_04"],["孟达","cao","commandery_city_109"],["曹丕","cao","luoyang"],["士燮","shi_xie","jiaozhi"],["公孙恭","gongsun_gong","xiangping"]]){assert(serving(g,name,force),`${name} 在任于 ${force}`);assert.equal(person(g,name).city,at,`${name} 驻 ${at}`)}
  for(const name of ["张飞","关羽","法正"])assert(!serving(g,name),`${name} 已不在任`);
  assert(serving(g,"张南（蜀）","liu")&&serving(g,"辅匡","liu"),"补录夷陵别督登场");
  const posts=Object.values(g.forceCommand.sun.posts).map(p=>e.postHolder(p)?.name);assert(posts.includes("陆逊")&&posts.includes("朱桓"),"吴大都督与濡须督");
  console.log("夷陵开局通过");}

// 2. 夷陵事件：火烧连营、孙权改元黄武、南中叛乱（以旁观势力触发，避免玩家所涉势力被事件强行改写）
{const g=await fresh("222_yiling","gongsun_gong");
  let text=fire(g,{year:222,month:6,day:1});assert.match(text,/火烧连营/);
  assert.equal(city(g,"yiling").force,"sun","夷陵归吴");assert.equal(person(g,"冯习").status,"dead");assert.equal(person(g,"黄权").force,"cao","黄权降魏");assert.equal(person(g,"杜路").force,"sun");
  assert(g.data.armies.find(a=>a.commander==="刘备").city!=="yiling","刘备退出夷陵");
  text=fire(g,{year:222,month:10});assert.match(text,/黄武/);assert(g.engine.worldWar(g,"cao","sun"),"魏吴交兵");
  text=fire(g,{year:223,month:7});assert.match(text,/南中叛乱/);assert.equal(city(g,"jianing").force,"neutral");assert.equal(person(g,"雍闿").force,"neutral");assert.equal(city(g,"commandery_city_063").force,"liu","永昌（不韦）闭境拒守");
  text=fire(g,{year:223,month:11});assert.match(text,/吴蜀复通/);assert(g.engine.worldFriendly(g,"liu","sun"));
  console.log("夷陵事件通过");}

// 3. 天水：曹叡在位，孟达据上庸被围，陇右三郡开局仍属魏，士燮已卒、交州归吴
{const g=await fresh("228_tianshui"),e=g.engine;
  assert.equal(g.court.dynasty,"魏");assert.equal(g.court.emperor.name,"曹叡");assert.deepEqual(g.court.skipped,[]);assert.deepEqual(g.forceCommandSkipped,[]);
  assert(g.court.titles.some(t=>t.title==="wang"&&t.fief==="吴"&&t.self),"孙权吴王已不受魏承认");
  for(const [id,force] of [["shangyong","liu"],["commandery_city_109","cao"],["commandery_city_122","cao"],["tianshui","cao"],["anding","cao"],["jiaozhi","sun"],["yiling","sun"],["xiangping","gongsun_yuan"],["hanzhong","liu"]])assert.equal(city(g,id).force,force,`228 ${id}`);
  assert(!g.data.officers.some(o=>o.name==="士燮"&&o.status!=="dead"),"士燮已卒（226）");
  assert(serving(g,"孟达","liu")&&person(g,"孟达").city==="shangyong");const siege=g.data.armies.find(a=>a.commander==="司马懿");assert.equal(siege.siegeTarget,"shangyong");assert.equal(siege.stance,"围城");
  for(const [name,force] of [["刘禅","liu"],["诸葛亮","liu"],["赵云","liu"],["马谡","liu"],["姜维","cao"],["曹真","cao"],["张郃","cao"],["陆逊","sun"],["周鲂","sun"],["公孙渊","gongsun_yuan"],["李盛","liu"],["戴良","sun"]])assert(serving(g,name,force),`${name} 在任于 ${force}`);
  assert.equal(person(g,"赵云").city,"xian_26_04","赵云据箕谷（寄于褒中）");
  const cao=Object.values(g.forceCommand.cao.posts).map(p=>[e.postHolder(p)?.name,p]);assert(cao.some(([n])=>n==="郭淮")&&cao.some(([n])=>n==="徐邈"),"雍、凉分置");
  console.log("天水开局通过");}

// 4. 天水事件：诸葛亮兵临祁山（西县/下辨一带）三郡响应；石亭；孙权称帝入僭号之列
{const g=await fresh("228_tianshui","gongsun_yuan");g.data.armies.find(a=>a.commander==="诸葛亮").city="commandery_city_069";
  let text=fire(g,{month:2});assert.match(text,/三郡叛魏应亮/);
  for(const id of ["tianshui","commandery_city_068","xian_22_05","anding"])assert.equal(city(g,id).force,"liu",id);assert.equal(city(g,"xian_extra_13").force,"cao","上邽为魏所保");
  assert(serving(g,"姜维","liu"));assert.equal(person(g,"马遵").city,"xian_extra_13");
  const before=g.data.armies.find(a=>a.commander==="曹休").soldiers;text=fire(g,{month:9});assert.match(text,/石亭/);assert(g.data.armies.find(a=>a.commander==="曹休").soldiers<before*.5);
  text=fire(g,{year:229,month:5});assert.match(text,/孙权称帝/);assert(g.court.usurpers.includes("sun"));
  console.log("天水事件通过");}

// 5. 受禅改称：汉剧本中曹氏受禅后以封国（魏）为国号，不以人名为朝号
{const g=await fresh("219_xiangyang","sun");const court=g.court;court.promotion={cao:3};court.control=95;const result=g.engine.promoteController(g,"cao",[],{forced:true,to:"abdication"});assert(result.ok,result.error);assert.equal(court.dynasty,"魏");assert.equal(g.engine.courtName(g),"魏廷");
  console.log("受禅国号通过");}

// 6. 存档往返与短程推演
for(const id of ["222_yiling","228_tianshui"]){const g=await fresh(id);g.observerMode=true;for(let i=0;i<30;i++)g.endTurn();
  const save=JSON.parse(JSON.stringify(g.serialize())),restored=new GameState(structuredClone(await loader.loadScenario(id,{useSavedMap:false})));restored.applySave(restored.migrateSave(save));
  assert.equal(restored.court.dynasty,"魏");assert.deepEqual(restored.court.usurpers,g.court.usurpers);assert.equal(restored.turn,g.turn);
  console.log(`${id} 三十日推演与存档往返通过`);}
console.log("夷陵、天水：魏廷与僭号 / 三国归属 / 开局人物与方面 / 史实事件 / 受禅国号 / 存档往返");
