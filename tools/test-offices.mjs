// 内政改制 P2：郡府所在（郡府／行郡事／寄领／幕府代行）、行政容量曲线、三环节合成分数、旧官署迁移、州府与幕府属吏。
import assert from "node:assert/strict";
globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),e=state.engine,cities=state.data.cities;

// 负荷曲线：80% 以内满效，100% 为 0.92，150% 约 0.67；最低 0.38。
assert.equal(e.loadEfficiency(.5),1);assert.equal(e.loadEfficiency(.8),1);assert(Math.abs(e.loadEfficiency(1)-.92)<1e-9);assert(Math.abs(e.loadEfficiency(.9)-.96)<1e-9);
assert(Math.abs(e.loadEfficiency(1.5)-.92*Math.pow(1/1.5,.8))<1e-9);assert.equal(e.loadEfficiency(20),.38);
assert.equal(e.loadCorruption(.8),0);assert.equal(e.loadCorruption(1),2);assert(e.loadCorruption(1.5)>e.loadCorruption(1));
assert.equal(Math.round(e.officeCapacity(45)),96);assert.equal(Math.round(e.officeCapacity(90)),132);

// 郡府所在：占郡治者为郡府；其余本郡据点归郡府。
const xuchang=cities.find(c=>c.id==="xuchang"),seat=e.commanderyOfficeNode(xuchang);
assert(seat&&seat.commanderySeatNode&&seat.commandery===xuchang.commandery,"许昌归颍川郡府");assert.equal(e.commanderyOffice(xuchang).mode,"seat");
assert.deepEqual(e.cityOfficeRoles(xuchang).commandery,[]);assert(e.cityOfficeRoles(seat).commandery.includes("granary"));
assert.deepEqual(e.cityOfficeRoles(xuchang).county,[e.magistrateRole(xuchang),"assistant","commandant"]);

// 行郡事：本方未据郡治但本郡有两处以上据点；只设两名郡掾。寄领：本郡只有一处据点。
const byCommandery=new Map;for(const c of cities){if(!byCommandery.has(c.commandery))byCommandery.set(c.commandery,[]);byCommandery.get(c.commandery).push(c)}
const [actingName,actingNodes]=[...byCommandery].find(([,list])=>list.length>=4&&list.some(c=>c.commanderySeatNode)&&list.every(c=>c.force!=="cao"));
const actingSeat=actingNodes.find(c=>c.commanderySeatNode),pair=actingNodes.filter(c=>!c.commanderySeatNode).slice(0,2),saved=actingNodes.map(c=>[c,c.force]);
for(const c of pair)c.force="cao";actingSeat.force=actingSeat.force==="cao"?"yuan":actingSeat.force;e.invalidateDuties();
const acting=e.commanderyOffice(pair[0]);assert.equal(acting.mode,"acting",`${actingName}应设行郡事`);assert(pair.includes(acting.office.node));
const host=acting.office.node,local=state.data.officers.filter(o=>o.force==="cao"&&o.status==="serving").slice(0,3);for(const o of local)o.city=host.id;
assert(e.assignCityAdministration(host.id,{agriculture:local[0].id,commerce:local[1].id}).ok,"行郡事可设两名郡掾");
assert(!e.assignCityAdministration(host.id,{order:local[2].id}).ok,"行郡事不能超过两名郡掾");
assert(e.assignCityAdministration(host.id,{secretary:local[2].id}).ok,"主簿不计入郡掾名额");
const score=e.affairScore(pair[1],"agriculture"),org=score.parts.find(p=>p.tier==="commandery");assert.equal(org.mode,"acting");assert.equal(org.factor,.9);
e.assignCityAdministration(host.id,{agriculture:null,commerce:null,secretary:null});
const lone=pair[1];const neighbor=e.officeMap().offices.filter(o=>o.force==="cao").flatMap(o=>o.nodes.map(item=>item.city)).flatMap(c=>(state.data.rules.city_graph[c.id]||[]).map(id=>cities.find(n=>n.id===id))).find(c=>c&&!c.commanderySeatNode&&byCommandery.get(c.commandery).every(n=>n.force!=="cao")),kin=byCommandery.get(neighbor.commandery),kinForces=kin.map(c=>[c,c.force]);for(const c of kin)c.force="neutral";neighbor.force="cao";e.invalidateDuties();
const info=e.commanderyOffice(neighbor);assert.equal(info.mode,"lodged","单据点之郡寄领邻郡郡府");assert.equal(info.office.force,"cao");assert.equal(info.office.nodes.find(item=>item.city===neighbor).weight,1.25);assert.equal(e.commanderyOfficeNode(neighbor),info.office.node);
for(const [c,force] of kinForces)c.force=force;
lone.force="cao";for(const [c,force] of saved)c.force=force;e.invalidateDuties();

// 三环节合成：所有环节为默认官员且负荷正常时，政务分数等于 45，与旧结算衔接。
const cache=e._familyCountyOfficials;e._familyCountyOfficials=new Map;const plain=cities.find(c=>c.force==="cao"&&c.countyNode&&!c.administration?.governorId&&!c.administration?.commandantId&&!c.fiscal?.attention&&!e.concurrentMagistrate(c)&&!e.isCityBesieged(c)),command=state.forceCommand.cao,central={...command.central};command.central={};e.invalidateDuties();
const officeNode=e.commanderyOfficeNode(plain),clerks={};for(const role of ["agriculture","commerce","order","defense","population","recruitment","granary"]){clerks[role]=officeNode.administration[`${role}Id`];officeNode.administration[`${role}Id`]=null}e.invalidateDuties();
for(const affair of ["agriculture","commerce","order","works","registry","conscription","training"])assert(Math.abs(e.affairScore(plain,affair).score-45)<1e-9,`${affair} 默认分数应为 45`);
Object.assign(officeNode.administration,Object.fromEntries(Object.entries(clerks).map(([role,id])=>[`${role}Id`,id])));e._familyCountyOfficials=cache;

// 幕府六席：任命后计入负荷；长史分担君主负荷。
const roster=state.data.officers.filter(o=>o.force==="cao"&&o.status==="serving"),pick=roster.find(o=>!e.officerLoad(o.id));command.central=central;
assert(e.setCentralOffice(state,"cao","treasurer",pick.id).ok);const load=e.officerLoad(pick.id);assert(load&&load.posts.some(p=>p.key==="court:cao:treasurer"),"度支官计入负荷");
assert.equal(e.centralProfile("cao","treasurer").officer,pick);assert(!e.setCentralOffice(state,"cao","nobody",pick.id).ok);
const affair=e.affairScore(xuchang,"commerce");assert.equal(affair.parts.find(p=>p.tier==="court").profile.officer,pick,"商业财政的幕府环节由度支官主责");
e.setCentralOffice(state,"cao","treasurer",null);

// 州府属吏：挂在州级方面上，兵曹从事取州府 0.07 权重。
const zhou=Object.values(command.posts).find(p=>p.kind==="zhou");assert(zhou,"曹操开局应有州级方面");const zhouCity=cities.find(c=>c.force==="cao"&&e.scopeContains(zhou.scope,c)&&e.provincePostOf(c)===zhou);
const staffer=roster.find(o=>o.id!==zhou.holderId&&o.id!==pick.id);assert(e.setProvinceOffice(state,zhou.id,"bingcao",staffer.id).ok);
const conscription=e.affairScore(zhouCity,"conscription");assert.equal(conscription.parts.find(p=>p.tier==="province").weight,.07);assert.equal(Math.round(conscription.parts.find(p=>p.tier==="commandery").weight*100),20);
assert(e.officerLoad(staffer.id).posts.some(p=>p.role==="bingcao"));assert(!e.setProvinceOffice(state,zhou.id,"biejia","nobody").ok);
const round=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});round.applySave(round.migrateSave(state.serialize()));
assert.equal(Object.values(round.forceCommand.cao.posts).find(p=>p.id===zhou.id)?.staff?.bingcao,staffer.id,"州府属吏随存档保存");

// 旧官署迁移：督练官→县尉；非郡府据点的劝农官等转为待命并记入官制日志。
const legacy=cities.find(c=>c.force==="cao"&&!e.isCommanderyOfficeNode(c)&&c.countyNode),people=roster.filter(o=>!e.officerLoad(o.id)).slice(0,3);for(const o of people)o.city=legacy.id;
Object.assign(legacy.administration,{schema:1,trainingId:people[0].id,agricultureId:people[1].id,orderId:people[2].id,commandantId:null});e._officeMigrationLog=[];const log=e.migrateAdministrationSchema();
assert.equal(legacy.administration.commandantId,people[0].id,"督练官转为县尉");assert.equal(legacy.administration.agricultureId,null);assert.equal(legacy.administration.orderId,null);assert.equal(legacy.administration.schema,2);assert(!("trainingId" in legacy.administration));
assert.deepEqual(log.map(item=>item.officerId).sort(),[people[1].id,people[2].id].sort(),"其余旧职转为待命");
const events=[];e.resolveAdministration(state,events);assert(events.some(x=>x.phase==="官制"&&x.text.includes(people[1].name)),"迁移名单写入汇报");
assert.equal(GameState.SAVE_VERSION,19);

// 负荷随职位叠加：一人兼郡府多职后超过 100%，效率随之下降。
const busy=roster.find(o=>!e.officerLoad(o.id)&&o.id!==pick.id&&o.id!==staffer.id),seatOffice=seat;busy.city=seatOffice.id;e.assignCityAdministration(seatOffice.id,{agriculture:busy.id});const one=e.officerLoad(busy.id).rate;
e.assignCityAdministration(seatOffice.id,{agriculture:busy.id,commerce:busy.id,order:busy.id,population:busy.id});const four=e.officerLoad(busy.id);assert(four.rate>one*3.5&&four.efficiency<e.loadEfficiency(one),"兼职越多负荷越高、效率越低");
// 幕府图（P3）：组织树、政务来源与阻碍、界面切换。
const chart=e.administrationChart("cao");assert.equal(chart.court.length,6);assert(chart.commanderies.length>=10);assert(chart.provinces.some(p=>p.postId===zhou.id));
assert(chart.commanderies.every(c=>c.counties.length&&c.head&&c.clerks.length===8),"每个郡府列出太守、主簿与七掾及其县廷");
const sources=chart.affairSources,granaryTotal=Object.values(sources.granary.departments).reduce((a,b)=>a+b,0);assert(Math.abs(granaryTotal-sources.granary.total)<1e-6);assert(sources.granary.departments["县廷县令"]>0);
for(const id of ["talent","registry","agriculture","finance","granary","works","order","conscription","training","intelligence","operations","diplomacy"])assert(sources[id],`政务 ${id} 有来源统计`);
assert(sources.granary.blockers.some(x=>x.includes("仓曹掾")),"郡府缺仓曹掾列为阻碍");
const busyPost=chart.commanderies.flatMap(c=>c.clerks).find(x=>x.officerId===busy.id);assert(busyPost&&busyPost.rate>1&&Object.keys(busyPost.affairs).length===1,"郡掾负荷只计入本类政务");
await import("../js/ui/admin-chart-ui.js");const html=AdminChartUI.render(state);for(const text of ["负荷率","余量","质量","粮储调拨","幕府","行政总览"])assert(html.includes(text),`幕府图缺少 ${text}`);
AdminChartUI.affair="granary";const filtered=AdminChartUI.render(state);assert(filtered.includes("容量来源")&&filtered.includes("is-dim"),"按政务筛选高亮与来源侧栏");AdminChartUI.affair="";AdminChartUI.picked=`court:cao:lord`;assert(AdminChartUI.render(state).includes("返回总览"));AdminChartUI.picked=null;
console.log(`行政容量通过：曲线 80%/100%/150% · 郡府/行郡事/寄领 · 默认 45 衔接 · 幕府六席 · 州府属吏 · 旧官署迁移 · 幕府图 · 兼职负荷 ${Math.round(one*100)}%→${Math.round(four.rate*100)}%`);
