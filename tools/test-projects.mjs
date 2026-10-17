// 内政改制 P4：项目事务——立项字段、默认主责、负荷、施工系数、优先级、阻碍、开垦与安置流民完工、向前线供粮。
import assert from "node:assert/strict";
globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),e=state.engine,ledger=FiscalSystem.initialize(state);
const city=state.data.cities.find(c=>c.id==="xuchang");city.localGold=20000;
const before=city.agriculture,events=[];assert(FiscalSystem.handleOrder(state,{type:"reclaim_land",commandName:"开垦",cityIds:[city.id],options:{}},events));
const project=ledger.projects.find(p=>p.type==="reclaim_land");assert(project,events.map(x=>x.text).join("；"));
assert.equal(project.affair,"agriculture");assert.equal(project.scale,"large");assert.equal(project.priority,"常规");assert(project.deadlineTurn>state.turn,"立项给出默认期限");
assert(!FiscalSystem.handleOrder(state,{type:"reclaim_land",commandName:"开垦",cityIds:[city.id],options:{}},[])||ledger.projects.filter(p=>p.type==="reclaim_land").length===1,"同城同类大项目不重复立项");

// 统一项目视图字段
let row=e.affairProjects(state,"cao").find(r=>r.id===project.id);for(const key of ["name","place","leadId","assists","resources","priority","deadlineTurn","progress","blockers"])assert(key in row,`项目缺少字段 ${key}`);
// 主责与负荷：大型项目主责 16 点，紧急 ×1.5；协办 8 点
const officers=state.data.officers.filter(o=>o.force==="cao"&&o.status==="serving"&&!e.officerLoad(o.id)),lead=officers.sort((a,b)=>b.politics-a.politics)[0],helper=officers.find(o=>o.id!==lead.id);
assert(e.updateProject(state,project.id,{leadId:lead.id,assistIds:[helper.id]}).ok);
const leadPost=e.officerLoad(lead.id).posts.find(p=>p.key===`project:${project.id}`);assert.equal(leadPost.load,16);assert.equal(e.officerLoad(helper.id).posts[0].load,8);
const normal=e.projectSpeed(project,city);assert(e.updateProject(state,project.id,{priority:"紧急"}).ok);assert.equal(e.officerLoad(lead.id).posts.find(p=>p.key===`project:${project.id}`).load,24);assert(Math.abs(e.projectSpeed(project,city)/normal-1.3)<.02||e.projectSpeed(project,city)===1.6*1.3,"紧急加速三成");
assert(!e.updateProject(state,project.id,{priority:"火速"}).ok);assert(!e.updateProject(state,project.id,{assistIds:officers.slice(1,6).map(o=>o.id)}).ok,"协办至多三人");
assert(e.updateProject(state,project.id,{leadId:null}).ok);row=e.affairProjects(state,"cao").find(r=>r.id===project.id);assert(row.blockers.some(b=>b.startsWith("缺任")),"无主责列为阻碍");assert(!e.officerLoad(lead.id)?.posts.some(p=>p.key===`project:${project.id}`));
// 默认官员时系数为 1；能干的主责加快施工
e.updateProject(state,project.id,{priority:"常规"});const plain=e.projectSpeed(project,city);e.updateProject(state,project.id,{leadId:lead.id});assert(e.projectSpeed(project,city)>plain,"能干的主责加快施工");
// 完工：开垦提高农业
project.completedDays=project.requiredDays-1;state.turn+=1;FiscalSystem.advanceProjects(state,events);assert.equal(project.status,"完成");assert.equal(city.agriculture,Math.min(100,before+4));assert(!e.officerLoad(lead.id)?.posts.some(p=>p.key===`project:${project.id}`),"完工后不再占负荷");

// 安置流民：完工后约六成流民落户
const host=state.data.cities.filter(c=>c.force==="cao").sort((a,b)=>e.refugeeCount(b)-e.refugeeCount(a))[0],refugees=e.refugeeCount(host),registered=e.countyPopulation(host.id);assert(refugees>=200,"曹操境内应有流民可安置");host.localGold=20000;
assert(FiscalSystem.handleOrder(state,{type:"settle_refugees",commandName:"安置流民",cityIds:[host.id],options:{}},events));const settle=ledger.projects.find(p=>p.type==="settle_refugees");assert.equal(settle.affair,"registry");
settle.completedDays=settle.requiredDays-1;state.turn+=1;FiscalSystem.advanceProjects(state,events);assert.equal(settle.status,"完成");const left=e.refugeeCount(host);assert(left<refugees*.5&&left>refugees*.3,`流民 ${refugees}→${left}`);assert(e.countyPopulation(host.id)>registered,"落户后登记人口增加");
const tiny=state.data.cities.find(c=>c.force==="cao"&&e.refugeeCount(c)<200);if(tiny){tiny.localGold=20000;FiscalSystem.handleOrder(state,{type:"settle_refugees",commandName:"安置流民",cityIds:[tiny.id],options:{}},events);assert(!ledger.projects.some(p=>p.type==="settle_refugees"&&p.cityId===tiny.id),"流民不足时不立项")}

// 向前线供粮：自动供粮线路列为项目，默认由度支官主责
const treasurer=officers.find(o=>o.id!==lead.id&&o.id!==helper.id);e.setCentralOffice(state,"cao","treasurer",treasurer.id);const front=state.data.cities.find(c=>c.force==="cao"&&c.id!==city.id);
ledger.supplyRoutes.push({id:"supply-test",forceId:"cao",sourceKind:"central",sourceCityId:city.id,targetCityId:front.id,targetFood:(front.localFood||0)*2+1000,reserveFood:0,batchFood:2000,enabled:true});e.invalidateDuties();
const line=e.affairProjects(state,"cao").find(r=>r.id==="supply-test");assert(line&&line.name.includes(front.name)&&line.affair==="granary");assert.equal(line.leadId,treasurer.id);assert(line.progress<1);assert(e.officerLoad(treasurer.id).posts.some(p=>p.key==="project:supply-test"));
const chart=e.administrationChart("cao");assert(chart.affairSources.granary.departments["项目主责"]>0,"幕府图把项目负荷计入容量来源");
await import("../js/ui/admin-chart-ui.js");AdminChartUI.mode="project";const html=AdminChartUI.render(state);assert(html.includes("向")&&html.includes("data-admin-project")&&html.includes("优先级"));AdminChartUI.mode="standing";
// 应急事务（P5）：新占领、灾异、战俘逾守军、粮道受阻自动立案并加负荷，条件消失即结案。
const spot=state.data.cities.find(c=>c.force==="cao"&&c.countyNode&&!e.isCityBesieged(c)),baseLoad=(e.invalidateDuties(),e.administrativeLoads().nodes.get(spot.id).magistrateLoad);
spot.occupiedUntil=state.turn+10;spot.disasterUntil=state.turn+20;spot.disasterName="蝗灾";spot.prisoners={infantry:(spot.garrison||0)+500};e.invalidateDuties();
const em=e.affairEmergencies(state,"cao").filter(r=>r.cityId===spot.id).map(r=>r.type).sort();assert.deepEqual(em,["战俘逾守军","新占领","灾异"].sort());
assert.equal(Math.round(e.administrativeLoads().nodes.get(spot.id).magistrateLoad-baseLoad),25,"新占领 +15、灾异 +10 计入县令负荷");
const reports=[];e.reportEmergencies(state,reports);assert(reports.some(r=>r.phase==="应急"&&r.text.includes("立案")&&r.text.includes(spot.name)));
const cargo={id:"cargo-test",forceId:"cao",sourceCityId:city.id,targetCityId:front.id,resource:"food",amount:3000,route:[city.id,front.id],nextIndex:0,status:"受阻"};ledger.shipments.push(cargo);assert(e.affairEmergencies(state,"cao").some(r=>r.type==="粮道受阻"),"受阻车队立案");
delete spot.occupiedUntil;delete spot.disasterUntil;spot.prisoners={};cargo.status="完成";const closed=[];e.reportEmergencies(state,closed);assert(closed.some(r=>r.text.includes("结案")),"条件消失即结案");assert(!e.affairEmergencies(state,"cao").some(r=>r.cityId===spot.id));
AdminChartUI.mode="emergency";assert(AdminChartUI.render(state).includes("应急事务"));AdminChartUI.mode="standing";
console.log(`应急事务通过：新占领 / 灾异 / 战俘 / 粮道受阻 / 立案结案汇报`);
console.log(`项目事务通过：立项字段 / 默认期限 / 主责协办负荷 16·8 / 紧急 ×1.5 / 施工系数 / 阻碍 / 开垦完工 / 安置流民 ${refugees}→${left} / 向前线供粮`);
