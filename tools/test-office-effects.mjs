// 内政改制 P6：各职专属效果——每项都对照"90 分在任"与"空缺（45 分）"，空缺时等于旧结算。
import assert from "node:assert/strict";
globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),e=state.engine,near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
let serial=0;const sage=(city,extra={})=>{const o={id:`qa_sage_${++serial}`,name:`试吏${serial}`,force:"cao",city:city.id,status:"serving",command:90,war:90,intelligence:90,politics:90,charm:90,loyalty:90,officeRank:0,...extra};state.hydrateOfficer(o);state.data.officers.push(o);return o};
assert.equal(e.officeBonus(45,.9),1);assert(near(e.officeBonus(90,.9),.9));assert(near(e.officeBonus(20,.9,1.1),1.1));assert(near(e.officeBonus(67.5,.9),.95));

// 车队：仓曹掾、太守、营缮掾缩短粮队日程并降损耗；度支官管中央上缴。每段合计不低于 0.75。
const seat=state.data.cities.find(c=>c.id===e.commanderyOfficeNode(state.data.cities.find(x=>x.id==="xuchang")).id),peer=state.data.cities.find(c=>c.force==="cao"&&c.commandery===seat.commandery&&c!==seat&&(state.data.rules.city_graph[seat.id]||[]).includes(c.id))||state.data.cities.find(c=>c.force==="cao"&&c.commandery===seat.commandery&&c!==seat);
const families=e._familyCountyOfficials,prefect=e.actualCommanderyGovernor(seat);e._familyCountyOfficials=new Map;e.assignCityAdministration(seat.id,{commanderyGovernor:null});e.invalidateDuties();
const route=e.logisticsPath(seat.id,peer.id,"cao"),plain=e.convoyModifiers(state,{forceId:"cao",route,resource:"food",purpose:"调运"});assert(plain.legDays.every(f=>near(f,1,.02)),"空缺时日程不变");assert(near(plain.loss,1,.02));e._familyCountyOfficials=families;
for(const role of ["granary","defense","commanderyGovernor"]){const o=sage(seat);if(role==="commanderyGovernor")e.assignCityAdministration(seat.id,{commanderyGovernor:o.id});else e.assignCityAdministration(seat.id,{[role]:o.id})}
const fast=e.convoyModifiers(state,{forceId:"cao",route,resource:"food",purpose:"调运"});assert(fast.legDays.every(f=>f<.95&&f>=.75),`郡内粮队日程缩短 ${fast.legDays}`);assert(fast.loss<.9,"仓曹掾降损耗");assert(fast.legCapacity.every(c=>c>1.05),"营缮掾提高通行量");
const extreme=e.convoyModifiers(state,{forceId:"cao",route,resource:"food",purpose:"上缴"});e.setCentralOffice(state,"cao","treasurer",sage(seat).id);const central=e.convoyModifiers(state,{forceId:"cao",route,resource:"food",purpose:"上缴"});assert(central.central&&central.legDays[0]<extreme.legDays[0]&&central.legDays.every(f=>f>=.75),"度支官加快中央车队，合计不低于 0.75");assert(central.loss<extreme.loss);
const ledger=FiscalSystem.initialize(state),cargo=FiscalSystem.enqueue(state,{forceId:"cao",sourceCityId:seat.id,targetCityId:peer.id,resource:"food",amount:5000,purpose:"调运"});assert(cargo,"可起运");

// 济粮：长史提高每批上限；度支官按路程放宽阈值。
e.setCentralOffice(state,"cao","chief",null);assert.equal(e.reliefBatch("cao",20000),20000);e.setCentralOffice(state,"cao","chief",sage(seat).id);assert(near(e.reliefBatch("cao",20000),24000,1));
const far=state.data.cities.filter(c=>c.force==="cao").map(c=>[c,e.reliefTriggerDays(state,"cao",c,30)]).sort((a,b)=>b[1]-a[1])[0];assert(far[1]>=30,"阈值不低于原值");

// 君主离都 −8%：长史 70 分以上完全抵消。
const capital=e.forceCapitalCity("cao"),lord=e.forceRulerOfficer("cao"),home=lord.city;lord.city=state.data.cities.find(c=>c.force==="cao"&&c.id!==capital.id).id;e.invalidateDuties();assert(e.lordAwayFromCapital("cao"));
assert.equal(e.lordAwayPenalty(capital),1,"90 分长史全抵离都减益");e.setCentralOffice(state,"cao","chief",null);assert(near(e.lordAwayPenalty(capital),.92),"无长史时都城 −8%");lord.city=home;e.invalidateDuties();assert.equal(e.lordAwayPenalty(capital),1);

// 司马、主簿（幕府）、郡主簿、劝农掾、贼曹掾、州功曹从事
e.setCentralOffice(state,"cao","marshal",null);assert.equal(e.marshalFactor("cao","reinforce"),e.officeBonus(e.centralScore("cao","marshal"),1.1,.95));e.setCentralOffice(state,"cao","marshal",sage(seat).id);assert(e.marshalFactor("cao","reinforce")>1.08&&e.marshalFactor("cao","training")>1.06&&e.marshalFactor("cao","rally")<.9);
assert.equal(e.maxPlayerOrders(state),8);e.setCentralOffice(state,"cao","secretary",sage(seat).id);assert.equal(e.maxPlayerOrders(state),10,"90 分幕府主簿命令上限 10");
assert.equal(e.inspectionTurns(seat,6),6);e.assignCityAdministration(seat.id,{secretary:sage(seat).id});assert.equal(e.inspectionTurns(seat,6),7,"郡主簿督查 6→7 旬");assert(e.secretaryCorruption(seat)<-3);
const farm0=e.farmingFactor(peer);e.assignCityAdministration(seat.id,{agriculture:sage(seat).id});assert(e.farmingFactor(peer)>1.07&&e.farmingFactor(peer)>farm0,"劝农掾屯田增收");
const escape0=e.prisonerEscapeFactor(peer);e.assignCityAdministration(seat.id,{order:sage(seat).id});assert(e.prisonerEscapeFactor(peer)<.82&&e.prisonerEscapeFactor(peer)<escape0);peer.order=30;assert(e.lowOrderBoost(peer)>1.25);peer.order=70;assert.equal(e.lowOrderBoost(peer),1);
const zhou=Object.values(state.forceCommand.cao.posts).find(p=>p.kind==="zhou"),zhouCity=state.data.cities.find(c=>c.force==="cao"&&e.provincePostOf(c)===zhou);assert.equal(e.provinceClerkAbility(zhouCity),0);e.setProvinceOffice(state,zhou.id,"gongcao",sage(zhouCity).id);assert.equal(e.provinceClerkAbility(zhouCity),9,"州功曹从事 +9");
e.setProvinceOffice(state,zhou.id,"biejia",sage(zhouCity).id);assert(e.postHolderBoost(zhou)>10,"别驾提高方面执行");e.setProvinceOffice(state,zhou.id,"zhizhong",sage(zhouCity).id);assert(near(e.provinceGovernanceBonus(zhouCity),1.03));

// 品级：月俸与忠诚梯度，欠俸 −1，位高品卑 −0.5，小数累计。
const clerk=sage(seat,{officeRank:3}),gold=state.resources.gold;let total=0;for(let i=0;i<2;i++)total+=e.monthlyOfficeLoyalty(state,clerk);assert.equal(state.resources.gold,gold-90,"三品月俸 45");assert.equal(total,3,"三品每月 +1.5（含功曹 ≥70 的 +1）");
state.resources.gold=0;const unpaid=e.monthlyOfficeLoyalty(state,clerk);assert(clerk.unpaid&&unpaid<=0,"欠俸时忠诚不升");state.resources.gold=gold;
e.setCentralOffice(state,"cao","talent",null);const lowly=sage(seat);e.setCentralOffice(state,"cao","advisor",lowly.id);assert.equal(e.postGrade(lowly.id),4);lowly.loyaltyCarry=0;e.monthlyOfficeLoyalty(state,lowly);assert(near(lowly.loyaltyCarry,-.5)||lowly.loyaltyCarry===.5,`位高品卑 −0.5（${lowly.loyaltyCarry}）`);
console.log("各职效果通过：车队日程损耗通行量 / 济粮 / 君主离都 / 司马 / 主簿命令上限 / 郡主簿督查 / 屯田 / 战俘 / 州功曹从事 / 别驾 / 治中 / 品级月俸与职品相称");
