// 人物编辑：剧本模板的修改按剧本单独保存在浏览器（IndexedDB），开新局时套用；不写入原始项目资源，也不影响已有战局存档。
// 记录格式：{version:1, scenarioId, savedAt, edits:{人物id:{字段:值}}, added:[自定义人物], removed:[自定义人物id]}。
window.ScenarioOfficerStore=class ScenarioOfficerStore{
  static FIELDS=["name","command","war","intelligence","politics","charm","skill","aptitude","force","city","status","loyalty","birthYear","deathYear","debutYear","discoverPlace"];
  static STATS=["command","war","intelligence","politics","charm"];
  static APTITUDES=["spear","halberd","crossbow","cavalry","siege","navy"];
  static GRADES=["S","A","B","C"];
  static STATUSES=["serving","free","hidden","discovered","not_appeared","prisoner","dead"];
  constructor(){this.storage=window.MapEditorDraftStore?new MapEditorDraftStore({database:"sanguo-scenario-officers",objectStore:"officers",legacyPrefix:"sanguo.scenario-officers.v1."}):null}
  static key(id){if(typeof id!=="string"||!/^[\w-]{1,80}$/.test(id))throw new Error("剧本标识无效");return `sanguo.scenario-officers.v1.${id}`}
  async get(id){return this.storage?this.storage.get(ScenarioOfficerStore.key(id)):null}
  async put(id,record){ScenarioOfficerStore.check(record,id);if(!this.storage)throw new Error("浏览器不支持本地数据库，无法保存人物修改");await this.storage.put(ScenarioOfficerStore.key(id),record);return record}
  async remove(id){if(this.storage)await this.storage.remove(ScenarioOfficerStore.key(id))}
  static check(record,id=record?.scenarioId){if(record?.version!==1||record.scenarioId!==id||typeof record.edits!=="object"||!Array.isArray(record.added)||!Array.isArray(record.removed))throw new Error("人物修改记录格式无效");return true}
  static emptyRecord(scenarioId){return {version:1,scenarioId,savedAt:null,edits:{},added:[],removed:[]}}
  // 校验单个人物：数值范围、生卒先后、所属势力与驻地存在；仕官者须驻于本势力城池。
  static validate(officer,data){const errors=[],cities=new Map((data.cities||[]).map(city=>[city.id,city])),forces=new Set((data.forces||[]).map(force=>force.id));
    if(!String(officer.name||"").trim())errors.push("姓名不能为空");
    for(const key of ScenarioOfficerStore.STATS){const value=officer[key];if(!Number.isInteger(value)||value<1||value>120)errors.push(`${{command:"统率",war:"武力",intelligence:"智力",politics:"政治",charm:"魅力"}[key]}须为 1—120 的整数`)}
    for(const key of ScenarioOfficerStore.APTITUDES)if(officer.aptitude&&!ScenarioOfficerStore.GRADES.includes(officer.aptitude[key]))errors.push(`兵种适性 ${key} 无效`);
    if(!forces.has(officer.force))errors.push("所属势力不存在");
    if(officer.city&&!cities.has(officer.city))errors.push("所在城池不存在");
    if(!ScenarioOfficerStore.STATUSES.includes(officer.status))errors.push("状态无效");
    if(officer.status==="serving"){if(officer.force==="neutral")errors.push("仕官者须有所属势力");else if(cities.get(officer.city)?.force!==officer.force)errors.push("仕官者须驻在本势力城池")}
    if(officer.loyalty!=null&&(!Number.isFinite(officer.loyalty)||officer.loyalty<0||officer.loyalty>100))errors.push("忠诚须为 0—100");
    const birth=officer.birthYear,debut=officer.debutYear,death=officer.deathYear;
    if(Number.isFinite(birth)&&Number.isFinite(death)&&death<birth)errors.push("卒年不能早于生年");
    if(Number.isFinite(birth)&&Number.isFinite(debut)&&debut<birth)errors.push("登场年不能早于生年");
    return errors}
  // 把记录套用到剧本数据上：修改原有人物、加入自定义人物、移除已删除的自定义人物。返回 {data, applied, skipped}。
  static apply(data,record){ScenarioOfficerStore.check(record,data.scenario?.id||record.scenarioId);const byId=new Map(data.officers.map(officer=>[officer.id,officer])),skipped=[];let applied=0;
    for(const [id,fields] of Object.entries(record.edits||{})){const officer=byId.get(id);if(!officer){skipped.push(id);continue}const next={...officer,...ScenarioOfficerStore.pick(fields)};const errors=ScenarioOfficerStore.validate(next,data);if(errors.length){skipped.push(`${officer.name}：${errors[0]}`);continue}Object.assign(officer,next);applied++}
    const removed=new Set(record.removed||[]);data.officers=data.officers.filter(officer=>!(officer.custom&&removed.has(officer.id)));
    for(const custom of record.added||[]){if(byId.has(custom.id)||removed.has(custom.id))continue;const officer={merit:0,office:"无",officeRank:0,stamina:100,experience:0,skills:custom.skill?[custom.skill]:[],...ScenarioOfficerStore.pick(custom),id:custom.id,custom:true,statsBasis:"custom"};const errors=ScenarioOfficerStore.validate(officer,data);if(errors.length){skipped.push(`${officer.name}：${errors[0]}`);continue}data.officers.push(officer);applied++}
    return {data,applied,skipped}}
  static pick(fields){const out={};for(const key of ScenarioOfficerStore.FIELDS)if(fields&&Object.hasOwn(fields,key))out[key]=structuredClone(fields[key]);return out}
};
