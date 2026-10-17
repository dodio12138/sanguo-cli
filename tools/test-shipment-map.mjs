import assert from "node:assert/strict";
globalThis.window=globalThis;await import("../js/ui/map-view.js");
const cargo={id:"food-1",forceId:"cao",sourceCityId:"a",targetCityId:"c",resource:"food",purpose:"调运",amount:1000,delivered:950,status:"在途",route:["a","b","c"],nextIndex:0,legDays:[10,6],segmentRemainingDays:5,arriveTurn:17};
const state={turn:2,playerForceId:"cao",layer:"political",policies:{fiscalAccounts:{shipments:[cargo,{...cargo,id:"gold",resource:"gold"},{...cargo,id:"enemy",forceId:"yuan"},{...cargo,id:"done",status:"完成"},{...cargo,id:"seized",status:"没收"}]}},rngState:123,data:{map:{width:20,height:20},cities:[{id:"a",name:"甲仓",x:0,y:0},{id:"b",name:"乙仓",x:4,y:0},{id:"c",name:"丙仓",x:8,y:0}],armies:[]},engine:{legInfo:()=>({mode:"land"}),supplyCut:()=>false,legDaysBetween:()=>10}};
const view=Object.create(MapView.prototype);Object.assign(view,{state,size:{w:500,h:500},scale:1,offset:{x:0,y:0},routes:[{from:"a",to:"b",points:[[0,0],[0,2],[4,2],[4,0]]},{from:"b",to:"c",points:[[4,0],[8,0]]}],draw(){},setZoom(value){this.scale=value}});
assert.deepEqual(view.grainShipments().map(c=>c.id),["food-1"]);
const before=JSON.stringify(state),p=view.shipmentPosition(cargo);assert.equal(p.x,2);assert.equal(p.y,2,"位置沿真实弯路内插，不能穿过两仓直线");assert.deepEqual(p.rest,[[2,2],[4,2],[4,0]]);assert.match(view.shipmentTooltip(cargo),/甲仓 → 丙仓/);assert.match(view.shipmentTooltip(cargo),/预计入库 950 石/);
const paths=[],rectangles=[],ctx={save(){},restore(){},fillRect(...args){rectangles.push(args)},strokeRect(){},measureText:s=>({width:s.length*6}),fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};view.drawMarchPath=(c,m,segments,color)=>paths.push({segments,color});view.drawGrainShipments(ctx,view.metrics());assert.equal(rectangles.length,1,"仅绘制一支本方在途粮队");assert.deepEqual(paths.at(-1).segments[0].points[0],[2,2]);assert.equal(paths.at(-1).color,"#c9a95a");assert.equal(JSON.stringify(state),before,"绘制、定位与悬停不能推进运输或改变状态");
assert(view.focusShipment("food-1"));assert.equal(view.shipmentFocusId,"food-1");assert(!view.focusShipment("enemy"));const m=view.metrics();assert.equal(view.shipmentAt(m.startX+(p.x+.5)*m.cell,m.startY+(p.y+.5)*m.cell).id,cargo.id);
cargo.status="受阻";paths.length=0;view.drawGrainShipments(ctx,view.metrics());assert.equal(paths.at(-1).color,"#e27962");assert.match(view.shipmentTooltip(cargo),/受阻，等待道路恢复/);assert.equal(view.shipmentPosition(cargo).x,2,"受阻保留原路段进度");
cargo.nextIndex=1;cargo.segmentRemainingDays=3;assert.equal(view.shipmentPosition(cargo).x,6);cargo.status="完成";assert.equal(view.grainShipments().length,0);assert.equal(view.shipmentAt(1,1),null);
view.setCargoPreview(["a","b","c"]);assert.deepEqual(view.cargoPreview,["a","b","c"]);view.setCargoPreview();assert.deepEqual(view.cargoPreview,[]);
// 自动补给粮队也沿同一弯路画线，不再从仓点之间拉直线。
state.data.armies=[{id:"army",force:"cao",convoy:{path:["a","b"],index:0,legLeft:5}}];const lines=[];ctx.lineTo=(x,y)=>lines.push([x,y]);view.drawSupplyLines(ctx,{startX:0,startY:0,cell:10});assert(lines.some(([x,y])=>x===5&&y===25));
console.log("调粮舆图通过：本方在途粮食 / 沿真实弯路插值 / 剩余路线与方向 / 受阻红线 / 已到粮队移除 / 悬停详情 / 整线定位 / 规划预览 / 自动粮队同口径 / 只读不改资源与地图");

// 粮食图层显示上缴线；线段与粮车都可悬停，分类与图例隐藏一致。
state.layer="food";state.data.armies=[];cargo.status="在途";cargo.purpose="上缴";cargo.targetKind="central";
assert.equal(view.grainRouteKind(cargo),"remit");assert(view.grainRouteVisible(cargo));assert.match(view.shipmentTooltip(cargo),/上缴中央：[\s\S]*运输损耗 50 石[\s\S]*中央府库/);
const fm=view.metrics();assert.equal(view.shipmentAt(fm.startX+(.5)*fm.cell,fm.startY+(1.5)*fm.cell)?.id,cargo.id,'粮道的真实弯路线段可以悬停');
view.hiddenLegendItems=new Set(["上缴中央"]);assert(!view.grainRouteVisible(cargo));view.hiddenLegendItems.clear();
assert.equal(view.grainRouteKind({...cargo,purpose:"中央济粮",targetKind:"local"}),"relief");assert.equal(view.grainRouteKind({...cargo,purpose:"调运",targetKind:"local"}),"local");
// 军队粮道适配同一悬停与定位入口，旧档没有原发运量时不伪造累计路损。
state.data.armies=[{id:"army",name:"前军",force:"cao",city:"b",convoy:{sourceId:"a",path:["a","b"],index:0,legLeft:5,food:1000,loadedFood:1050,escort:30}}];
let armyCargo=view.armyGrainTransports()[0];assert.equal(armyCargo.arriveTurn-state.turn,5);assert.equal(armyCargo.transportLoss,50);assert(armyCargo.delivered<armyCargo.currentFood);assert.match(view.shipmentTooltip(armyCargo),/军队粮道：[\s\S]*前军[\s\S]*护送 30 人/);assert(view.focusShipment(armyCargo.id));
delete state.data.armies[0].convoy.loadedFood;armyCargo=view.armyGrainTransports()[0];assert.match(view.shipmentTooltip(armyCargo),/原发运数未记录/);assert.match(view.shipmentTooltip(armyCargo),/累计路损未详/);
state.data.armies[0].force="yuan";assert.equal(view.armyGrainTransports().length,0,'不泄露敌方粮道');
console.log("粮食线路增强通过：上缴与济粮分类 / 粮道整段命中 / 图例过滤 / 军队余粮、路损与到达时间 / 旧档未知量 / 敌方隐藏");
