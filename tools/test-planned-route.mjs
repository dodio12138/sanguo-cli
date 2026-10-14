import assert from "node:assert/strict";
import fs from "node:fs";
import {appSource} from "./app-source.mjs";
globalThis.window=globalThis;await import("../js/core/map-grid.js");await import("../js/ui/map-view.js");

// 行军规划预览：切换方案即重绘，规划时隐去该军团现行路线，关闭规划即清除。
const view=Object.create(MapView.prototype);let draws=0;const drawn=[];
Object.assign(view,{draw(){draws++},state:{playerForceId:"liu",intelligence:{armies:{}},data:{armies:[{id:"a1",force:"liu",city:"x",route:["y","z"]},{id:"a2",force:"liu",city:"p",route:["q"]}],forces:[{id:"liu",color:"#637fa5"}]}},armyPosition:()=>null,legSegments:ids=>[{points:ids.map((id,index)=>[index,0]),mode:"land"}],drawMarchPath:(c,m,segments,color)=>drawn.push(color)});
view.setPlannedRoute(["x","y"],"a1");assert.deepEqual(view.plannedRoute,["x","y"]);assert.equal(view.plannedArmyId,"a1");
const source=["x","w","v"];view.setPlannedRoute(source,"a1");source.push("u");assert.deepEqual(view.plannedRoute,["x","w","v"],"保存路线副本，不受外部数组改动影响");assert.equal(draws,2,"每次切换方案都重绘");
drawn.length=0;view.drawArmyRoutes({}, {});assert.equal(drawn.length,1,"规划中的军团不再画现行路线，其余军团照常");
view.setPlannedRoute();assert.deepEqual(view.plannedRoute,[]);assert.equal(view.plannedArmyId,null,"关闭规划后清除");drawn.length=0;view.drawArmyRoutes({}, {});assert.equal(drawn.length,2,"关闭规划后恢复显示现行路线");
view.setPlannedRoute([],"a1");assert.deepEqual(view.plannedRoute,[]);assert.equal(view.plannedArmyId,"a1","目标不可达时也隐去旧路线，避免误以为方案未刷新");
const app=appSource();
assert(app.includes('$("plannerDialog").addEventListener("close",()=>map.setPlannedRoute())'),"任何方式关闭规划窗口都清除预览");
assert(app.includes("map.setPlannedRoute(route,army.id)"),"预览随所选军团与方案刷新");
console.log("行军规划预览通过：切换方案重绘 / 规划时隐去该军团旧路线 / 关闭即清除");
