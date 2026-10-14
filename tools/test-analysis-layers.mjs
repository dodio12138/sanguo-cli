import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["map-grid","data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(pathToFileURL(path.join(root,`js/core/${file}.js`)));
await import(pathToFileURL(path.join(root,"js/ui/map-view.js")));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const state=new GameState(structuredClone(await loader.loadScenario("194_puyang",{useSavedMap:false})),{playerForceId:"liu"});
const view=Object.create(MapView.prototype);Object.assign(view,{state,territoryRadius:8,hiddenLegendItems:new Set()});
const cityOf=id=>state.data.cities.find(city=>city.id===id),cellOf=city=>({x:city.x,y:city.y,terrain:"plains",province:city.province,commandery:city.commandery});
view.politicalOwner=cell=>{const city=state.data.cities.find(item=>item.x===cell.x&&item.y===cell.y);return {force:state.data.forces.find(force=>force.id===city?.force),city,distance:0,administrative:true}};

// 关系：我方、盟友（陶谦）、交战（曹操对吕布不涉我方，吕布对我为中立或敌视）、无主。
assert.equal(view.relationBand("liu"),"我方");assert.equal(view.relationBand("tao_qian"),"盟友","194 年陶谦与刘备结盟");assert.equal(view.relationBand("neutral"),"无主");
state.engine.declareWorldWar(state,"lu_bu","liu",[],"测试");view.relationCache=null;assert.equal(view.relationBand("lu_bu"),"交战");
for(const band of Object.values({a:view.relationBand("cao"),b:view.relationBand("yuan")}))assert(Object.keys(MapView.RELATION_BANDS).includes(band));

// 粮食与武将：按郡与势力汇总；己方给实数，他方未详查时为“不详”。
const xiaopei=cityOf("xiaopei"),own=view.layerGroupAt(cellOf(xiaopei));
assert.equal(own.force,"liu");assert(own.food>0&&own.need>0&&Number.isFinite(own.days));assert(MapView.FOOD_BANDS.some(([name])=>name===view.foodBand(own)));
assert(own.officers.some(officer=>officer.name==="刘备"),"小沛驻将含刘备");assert.equal(own.officers.length,state.data.officers.filter(officer=>officer.status==="serving"&&officer.force==="liu"&&["xiaopei","commandery_city_011"].includes(officer.city)).length,"沛郡：小沛与相县驻将合计");assert(own.officers.length>=6);assert.equal(view.officerBand(own),"众将");
const tip=view.analysisTooltip.call(Object.assign(view,{}),cellOf(xiaopei),xiaopei,xiaopei.commandery);
state.layer="officers";assert.match(view.tooltipText(cellOf(xiaopei)),/驻将 \d+ 人：.*刘备/);state.layer="food";assert.match(view.tooltipText(cellOf(xiaopei)),/仓储 [\d,]+ 石｜日耗 [\d,]+ 石｜可支/);
const enemy=state.data.cities.find(city=>city.force==="yuan"),enemyGroup=view.layerGroupAt(cellOf(enemy));assert.equal(view.foodBand(enemyGroup),"不详","未探明他方仓储不详");assert.equal(view.officerBand(enemyGroup),"不详");
assert.match(view.tooltipText(cellOf(enemy)),/情报不足/);
state.intelligence.cities[enemy.id]=3;view.layerGroupCache=null;assert.notEqual(view.foodBand(view.layerGroupAt(cellOf(enemy))),"不详","详查后显示他方仓储");

// 每日更新：缓存随日期刷新，粮仓见底则转为告急。
for(const city of state.data.cities.filter(item=>item.force==="liu"&&item.commandery===xiaopei.commandery))city.localFood=0;state.turn++;assert.equal(view.foodBand(view.layerGroupAt(cellOf(xiaopei))),"告急");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8"),app=appSource();
for(const [layer,label] of [["relation","关系"],["food","粮食"],["officers","武将"]]){assert(html.includes(`<button data-layer="${layer}">${label}</button>`),`缺少${label}图层按钮`);assert(app.includes(`${layer}:{label:"${label}"`),`缺少${label}图例`)}
console.log("分析图层通过：关系（我方、盟友、交战、无主）/ 粮食按郡汇总可支日数 / 武将驻将数 / 他方未详查为不详 / 每日刷新");
