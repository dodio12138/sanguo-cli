import fs from "node:fs";

globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),city=state.data.cities.find(c=>c.id==="xuchang"),army=state.data.armies.find(a=>a.id==="cao_central"),officers=state.data.officers.filter(o=>o.force==="cao"&&o.city==="xuchang"&&o.status==="serving");
if(city.commandery!=="颍川郡"||!city.counties.includes("阳翟")||city.administration.recruitmentTarget<=city.garrison)throw new Error("郡县资料或城市治理初值未载入");
if(state.engine.officialProfile(city,"agriculture").displayName!=="普通官员"||state.engine.officialProfile(city,"agriculture").raw!==45)throw new Error("空缺官槽没有普通官员兜底");

const official=officers.find(o=>o.name==="荀彧")||officers[0],second=officers.find(o=>o.id!==official.id&&!state.engine.isOfficerAssigned(o));
const appointed=state.engine.assignCityAdministration(city.id,{governor:official.id,agriculture:official.id,commerce:official.id,order:official.id,recruitment:official.id,commanderyGovernor:official.id});
if(!appointed.ok||state.engine.officerDutyCount(official.id)<5||state.engine.dutyEfficiency(official.id)>=1)throw new Error("兼任职务或效率递减未生效");

city.administration.boosts.agriculture=state.turn+5;const agricultureBefore=city.agriculture,garrisonBefore=city.garrison;city.administration.recruitmentTarget=city.garrison+600;for(let i=0;i<5;i++)state.engine.resolveAdministration(state,[]);
if(city.agriculture<=agricultureBefore||city.garrison<=garrisonBefore)throw new Error("持续农业发展或自动征募未生效");

const commander=state.data.officers.find(o=>o.name===army.commander),military=state.engine.assignArmyOffices(army.id,{commander:commander?.id,deputy:second?.id||null,staff:null,target:army.soldiers+500});
if(!military.ok||army.reinforcementTarget!==army.soldiers+500)throw new Error("军职任命或补员目标设置失败");
const soldiersBefore=army.soldiers;city.garrison=Math.max(city.garrison,3000);state.engine.resolveAdministration(state,[]);if(army.soldiers<=soldiersBefore)throw new Error("军团没有按目标自动补员");

const save=state.serialize(),migrated=state.migrateSave({...save,version:13});if(save.version!==16||migrated.version!==16||!save.world.cities.find(c=>c.id==="xuchang").administration||!save.world.counties?.length)throw new Error("v16 存档没有持久化治理及县域状态");
const view=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");for(const text of ["郡县官署任命","普通官员 · 能力45","军职任命","自动补员目标","data-office-role","更换 / 任命","data-officer-appointment"])if(!view.includes(text))throw new Error(`治理 UI 缺少 ${text}`);

console.log("郡县治理通过：郡守/太守/属官槽 / 普通官员 / 兼任衰减 / 持续发展 / 自动征募补员 / 军职槽 / v16 存档");
