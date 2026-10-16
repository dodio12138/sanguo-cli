import assert from "node:assert/strict";
import fs from "node:fs";
import {appSource} from "./app-source.mjs";
globalThis.window=globalThis;await import("../js/ui/map-view.js");
const city={id:"xu",name:"许昌",x:3,y:4,force:"cao",province:"豫州",commandery:"颍川郡"},county={name:"许县",cityId:"xu",population:12345,agriculture:50,commerce:60,order:70};
const view=Object.create(MapView.prototype);Object.assign(view,{territoryRadius:8,state:{layer:"political",playerForceId:"cao",intelligence:{cities:{}},data:{cities:[city],counties:[county],forces:[{id:"cao",name:"曹操"}]}},politicalOwner:()=>({force:{name:"袁绍"},distance:0,administrative:true}),terrainDef:()=>({name:"平原"})});
const point={x:3,y:4,terrain:"plains",province:"豫州",commandery:"颍川郡",county};
let text=view.tooltipText(point);assert.match(text,/所属势力：曹操/);assert.match(text,/豫州 · 颍川郡/);assert.doesNotMatch(text,/县治/);assert(!/编户|12345|农50|商60/.test(text));assert(text.includes("\n"));
text=view.tooltipText({...point,x:5,county:null});assert.match(text,/所属势力：袁绍/);assert.doesNotMatch(text,/县治/);
view.politicalOwner=()=>({force:{name:"曹操"},distance:99});assert.match(view.tooltipText({...point,x:5,county:null}),/所属势力：无主/);
assert.equal(view.tooltipText({...point,terrain:"ocean"}),"海域");
view.state.layer="terrain";assert.match(view.tooltipText(point),/编户 12,345/);
// 迷雾：他方县域未探明时不显示户口与农商治，略知内情只给概数。
view.state.playerForceId="yuan";assert.doesNotMatch(view.tooltipText(point),/编户|农50/);view.state.intelligence.cities.xu=2;assert.match(view.tooltipText(point),/编户 约/);assert.doesNotMatch(view.tooltipText(point),/12,345|农50/);view.state.playerForceId="cao";view.state.intelligence.cities={};
view.state.data.officers=[{id:"a",city:"xu",force:"cao",status:"serving"},{id:"b",city:"xu",force:"cao",status:"injured"},{id:"c",city:"xu",force:"cao",status:"free"},{id:"d",city:"xu",force:"cao",status:"dead"}];assert.match(view.tooltipText(point),/驻地武将：2人/);view.state.playerForceId="yuan";assert.match(view.tooltipText(point),/驻地武将：未探明/);assert.doesNotMatch(view.tooltipText(point),/2人/);view.state.intelligence.cities.xu=2;assert.match(view.tooltipText(point),/驻地武将：2人/);view.state.playerForceId="cao";
const tip={style:{},offsetWidth:120,offsetHeight:80};globalThis.document={getElementById:()=>tip};view.hover=point;view.size={w:200,h:150};view.state.data.map={width:20,height:15};view.state.data.armies=[];view.scale=1;view.offset={x:0,y:0};view.tooltip(false,199,149);assert.equal(tip.style.left,"75px");assert.equal(tip.style.top,"65px");view.tooltip(true);assert(tip.hidden);
const css=fs.readFileSync(new URL("../css/os-desktop.css",import.meta.url),"utf8"),legend=css.split("\n").find(line=>line.startsWith(".game-started .map-column .map-legend{"));for(const rule of ["flex:0 0 74px","height:74px","align-content:flex-start","overflow:auto","scrollbar-gutter:stable"])assert(legend.includes(rule),`图例必须稳定占位：${rule}`);
console.log("舆图提示与布局通过：势力和州郡县 / 不暴露户数 / 城池实际所属 / 野外控制范围 / 海域无势力 / 其他图层保留信息 / 提示不溢出 / 图例固定占位");
// 点击军团：己方与已探明军团可点开详情，未探明敌军不响应。
{
  const armyView=Object.create(MapView.prototype),own={id:"a1",force:"cao",city:"xu",soldiers:5000},hidden={id:"a2",force:"yuan",city:"ye",soldiers:8000},picked=[];
  Object.assign(armyView,{state:{playerForceId:"cao",intelligence:{cities:{},armies:{}},selected:{value:null},select(){},data:{cities:[{id:"xu",x:3,y:4,force:"cao"},{id:"ye",x:8,y:2,force:"yuan"}],armies:[own,hidden]}},routes:[],metrics:()=>({cell:10,startX:0,startY:0}),canvas:{getBoundingClientRect:()=>({left:0,top:0})},cellAt:()=>null,draw(){},onArmyPick:army=>picked.push(army.id)});
  armyView.pick({clientX:(3+.78)*10,clientY:(4+.7)*10});assert.deepEqual(picked,["a1"],"点击己方军团标记应打开详情");
  armyView.pick({clientX:(8+.78)*10,clientY:(2+.7)*10});assert.deepEqual(picked,["a1"],"未探明敌军不可点选");
  armyView.state.intelligence.armies.a2=1;armyView.pick({clientX:(8+.78)*10,clientY:(2+.7)*10});assert.deepEqual(picked,["a1","a2"],"探明后可点开敌军情报");
  const source=appSource();assert.ok(source.includes("map.onArmyPick=army=>openArmyDetail(army)"),"地图点击军团须接入军团详情");assert.ok(/if\(intel<3\)\{if\(intel>=1\)\{[^}]*openEnemyArmyDetail/.test(source),"情报不足时只显示敌军情报");
}
console.log("军团点选与迷雾通过：己方点开详情 / 未探明不可点 / 探明后显示有限情报");
