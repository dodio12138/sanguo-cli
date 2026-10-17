// 出征军职：主将、副将若干、军师、军需官、军司马、部将若干；不设规模门槛，按容量兼领；部将分领兵；分遣须随军人物带队。
import assert from "node:assert/strict";
globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),e=state.engine,army=state.data.armies.find(a=>a.id==="cao_central");
let serial=0;const person=(stats={})=>{const o={id:`qa_army_${++serial}`,name:`试将${serial}`,force:"cao",city:army.city,status:"serving",command:60,war:60,intelligence:60,politics:60,charm:50,loyalty:90,...stats};state.hydrateOfficer(o);state.data.officers.push(o);return o};
const commander=person({command:80,war:80});

// 任免校验：同一人只任一职；部将所领兵不得超过全军现有。
assert(!e.setArmyOffices(army.id,{commander:commander.id,staff:commander.id}).ok,"同一人只能任一职");
assert(!e.setArmyOffices(army.id,{commander:commander.id,lieutenants:[{officerId:person().id,units:{cavalry:(army.units.cavalry||0)+1}}]}).ok,"部将领兵不超过现有");
assert(e.setArmyOffices(army.id,{commander:commander.id}).ok);

// 小部队：军需、军务由主将兼领；大军：主将超载，军需改由普通军吏代办，界面据负荷标红。
army.soldiers=3000;army.units={infantry:3000,cavalry:0,archers:0};e.invalidateDuties();
assert.equal(e.armyDutyProfile(army,"quartermaster").mode,"concurrent","小部队主将兼领军需");assert(e.officerLoad(commander.id).rate<=.8);
army.soldiers=60000;army.units={infantry:60000,cavalry:0,archers:0};e.invalidateDuties();
assert.equal(e.armyDutyProfile(army,"quartermaster").mode,"default","大军主将无余力兼领");assert(e.officerLoad(commander.id).rate>1,"六万大军主将超载");
const deputies=[person({command:75}),person({command:75})];assert(e.setArmyOffices(army.id,{commander:commander.id,deputies:deputies.map(o=>o.id)}).ok);const relieved=e.officerLoad(commander.id).rate;assert(relieved<e.armyLoadModel(army).command/e.officeCapacity(80)+.5&&deputies.every(o=>e.officerLoad(o.id).posts.some(p=>p.role==="deputy")),"副将分担主将负荷");

// 军需官与军司马的具体效果（90 分）。
const qm=person({politics:90,intelligence:90}),marshal=person({command:90,politics:90}),staff=person({intelligence:90,command:90});army.soldiers=8000;army.units={infantry:6000,cavalry:2000,archers:0};
const rationBefore=FiscalSystem.armyDailyNeed(state,army);assert(e.setArmyOffices(army.id,{commander:commander.id,deputies:[deputies[0].id],quartermaster:qm.id,marshal:marshal.id,staff:staff.id}).ok);
assert(FiscalSystem.armyDailyNeed(state,army)<rationBefore,"军需官减军粮日耗");assert(e.quartermasterFactor(army,"ration")<.93&&e.quartermasterFactor(army,"carry")>1.1);
assert(e.marshalArmyFactor(army,"loss")<.85&&e.marshalArmyFactor(army,"recover")>1.15,"军司马减组织度损耗、加快休整");assert(e.staffAmbushFactor(army)<.6,"军师减受伏打击");

// 部将分领骑兵：按部将的统率与兵种适性计战力。
const strong=person({command:95,war:90,aptitude:{cavalry:"S"}}),weak=person({command:30,war:30});
const powerWith=lt=>{e.setArmyOffices(army.id,{commander:commander.id,lieutenants:[{officerId:lt.id,units:{cavalry:2000}}]});return e.combatBreakdown(army).total};
assert(powerWith(strong)>powerWith(weak),"部将能力影响所领兵的战力");

// 副将接替：主将阵亡后首位副将代行指挥。
assert(e.setArmyOffices(army.id,{commander:commander.id,deputies:[deputies[1].id]}).ok);commander.status="dead";e.syncAllArmyOfficerLocations(true);assert.equal(army.commanderOfficerId,deputies[1].id,"副将接替主将");commander.status="serving";

// 分遣小队：须由随军人物带队；部将默认带走其所领兵种。
const lt=person({command:70,war:70});assert(e.setArmyOffices(army.id,{commander:commander.id,lieutenants:[{officerId:lt.id,units:{cavalry:1500}}]}).ok);
const noEscort=state.data.armies.find(a=>a.force==="cao"&&a.id!==army.id&&!e.armyEscorts(a).length&&a.soldiers>1200);
if(noEscort){const fail=e.resolveFieldOrder(state,{armyIds:[noEscort.id],options:{mission:"harass",target:{x:0,y:0},detachSoldiers:1000}},[],"cao");assert(!fail.ok&&/随军人物/.test(fail.error),"无随军人物不能分遣")}
const pos=e.armyWorldPosition(army),out=e.resolveFieldOrder(state,{armyIds:[army.id],options:{mission:"harass",target:{x:Math.round(pos.x)+2,y:Math.round(pos.y)},detachSoldiers:1500,officerId:lt.id}},[],"cao");
assert(out.ok,out.error);assert.equal(out.army.commanderOfficerId,lt.id,"部将带队");assert.equal(out.army.units.cavalry,1500,"带走其所领骑兵");assert(!e.armyLieutenants(army).some(row=>row.officerId===lt.id),"带队部将离开原军编制");
console.log("出征军职通过：任免校验 / 小部队兼领、大军超载 / 副将分担与接替 / 军需官、军司马、军师效果 / 部将领兵战力 / 分遣须随军人物带队");
