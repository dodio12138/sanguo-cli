import fs from "node:fs";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),city=state.data.cities.find(c=>c.id==="xuchang"),army=state.data.armies.find(a=>a.id==="cao_central"),officers=state.data.officers.filter(o=>o.force==="cao"&&o.city==="xuchang"&&o.status==="serving");
if(state.engine.officialProfile(city,"commanderyGovernor").displayName==="普通官员")throw new Error("旧城市太守初值未迁入统一郡职");
if(city.commandery!=="颍川郡"||!city.counties.includes("阳翟")||city.administration.recruitmentTarget<=city.garrison)throw new Error("郡县资料或城市治理初值未载入");
const local=state.engine.officialProfile(city,"agriculture");if(!local.familyId||local.defaulted)throw new Error("在地世家没有接入空缺属官槽");
const cache=state.engine._familyCountyOfficials;state.engine._familyCountyOfficials=new Map();if(state.engine.officialProfile(city,"agriculture").displayName!=="普通官员"||state.engine.officialProfile(city,"agriculture").raw!==60)throw new Error("无在地世家的空缺官槽没有普通官员兜底");state.engine._familyCountyOfficials=cache;

const official=officers.find(o=>o.name==="荀彧")||officers[0],second=officers.find(o=>o.id!==official.id&&!state.engine.isOfficerAssigned(o));
// 郡掾只设在郡府（郡治或行郡事）据点；许昌不是颍川郡治，只设县廷三职。
const seat=state.engine.commanderyOfficeNode(city);if(!seat||seat===city||state.engine.assignCityAdministration(city.id,{agriculture:official.id}).ok)throw new Error("非郡府据点不应能任命郡掾");
official.city=seat.id;const appointed=state.engine.assignCityAdministration(seat.id,{countyGovernor:official.id,agriculture:official.id,commerce:official.id,order:official.id,recruitment:official.id,granary:official.id,commanderyGovernor:official.id});
if(!appointed.ok||state.engine.officerDutyCount(official.id)<7||state.engine.dutyEfficiency(official.id)>=1||state.engine.officerLoad(official.id).rate<=1)throw new Error("兼任职务未按行政容量超载降效");
official.city="xuchang";state.engine.assignCityAdministration(seat.id,{countyGovernor:null,agriculture:null,commerce:null,order:null,recruitment:null,granary:null});

city.administration.boosts.agriculture=state.turn+5;const agricultureBefore=city.agriculture,garrisonBefore=city.garrison;city.administration.manualRecruitment=true;city.administration.recruitmentTarget=city.garrison+600;for(let i=0;i<5;i++)state.engine.resolveAdministration(state,[]);
if(city.agriculture<=agricultureBefore||city.garrison<=garrisonBefore)throw new Error("持续农业发展或自动征募未生效");

const commander=state.data.officers.find(o=>o.name===army.commander),military=state.engine.assignArmyOffices(army.id,{commander:commander?.id,deputy:second?.id||null,staff:null,target:army.soldiers+500});
if(!military.ok||army.reinforcementTarget!==army.soldiers+500)throw new Error("军职任命或补员目标设置失败");
const soldiersBefore=army.soldiers;city.garrison=Math.max(city.garrison,3000);state.engine.resolveAdministration(state,[]);if(army.soldiers<=soldiersBefore)throw new Error("军团没有按目标自动补员");

const save=state.serialize(),migrated=state.migrateSave({...save,version:13});if(save.version!==GameState.SAVE_VERSION||migrated.version!==GameState.SAVE_VERSION||!save.world.cities.find(c=>c.id==="xuchang").administration||!save.world.counties?.length)throw new Error("v17 存档没有持久化治理及县域状态");
const view=appSource();for(const text of ["郡县官署任命","普通官员 · 能力60","军职任命","自动补员目标","data-office-role","更换 / 任命","data-officer-appointment"])if(!view.includes(text))throw new Error(`治理 UI 缺少 ${text}`);

console.log("郡县治理通过：郡守/太守/属官槽 / 普通官员 / 兼任衰减 / 持续发展 / 自动征募补员 / 军职槽 / v17 存档");

// 郡守即太守：旧 governor 入口和郡级入口共用实际任职，不重复计为两份郡职。
{const e=state.engine,head=e.officialProfile(city,"commanderyGovernor"),alias=e.officialProfile(city,"governor");if(head.id!==alias.id||head.name!=="太守")throw new Error("太守与郡守没有统一");const keys=[...e.officerDutyKeys(head.id)].filter(k=>k===`commandery:${city.force}:${city.commandery}`);if(keys.length!==1)throw new Error("同一太守重复计职");const holding=state.court.offices.filter(i=>i.office==="taishou"&&i.seat===city.commandery&&i.forceId===city.force);if(holding.length!==1||holding[0].officerId!==head.id)throw new Error("实际太守和汉庭任职未同步");}
