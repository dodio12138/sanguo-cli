// 已发布的剧本地图与编辑草稿、战局存档分别保存，不写入原始项目资源。
window.ScenarioMapStore=class ScenarioMapStore{
  constructor(){this.storage=new MapEditorDraftStore({database:"sanguo-scenario-maps",objectStore:"maps",legacyPrefix:"sanguo.scenario-map.v1."})}
  static key(id){if(typeof id!=="string"||!/^[\w-]{1,80}$/.test(id))throw new Error("剧本标识无效");return `sanguo.scenario-map.v1.${id}`}
  static fingerprint(data,{legacy=false}={}){const editor=new MapEditor(data),value=legacy?editor._legacyApplied:editor._applied;let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)}
  static matchesBase(data,fingerprint){const current=ScenarioMapStore.fingerprint(data),compat=data.officerPostings?.mapCompatibility?.[data.scenario?.id];return fingerprint===current||fingerprint===ScenarioMapStore.fingerprint(data,{legacy:true})||compat?.current===current&&compat.previous.includes(fingerprint)}
  async get(id){return this.storage.get(ScenarioMapStore.key(id))}
  async put(id,record){if(record?.version!==1||record.scenarioId!==id||!record.patch||!record.baseFingerprint)throw new Error("剧本地图记录无效");await this.storage.put(ScenarioMapStore.key(id),record);return record}
  async remove(id){await this.storage.remove(ScenarioMapStore.key(id))}
  async list(){return this.storage.list()}
  static prepare(base,record,{allowBaseChange=false}={}){
    if(record?.version!==1||record.scenarioId!==base.scenario?.id||!record.patch||!record.baseFingerprint)throw new Error("保存的剧本地图格式无效");
    if(!allowBaseChange&&!ScenarioMapStore.matchesBase(base,record.baseFingerprint))throw new Error("原始剧本数据已变化，请在编辑器核对后载入已保存地图");
    const candidate=structuredClone(base);if(Array.isArray(record.patch.cities))window.DataLoader?.remapRosterOfficers(candidate,record.patch.cities,{onlyExpansion:true,targetMap:record.patch.map});const editor=new MapEditor(candidate);editor.importPatch(record.patch);editor.applyTo(candidate);
    candidate.meta={...candidate.meta,scenarioMap:{status:"saved",savedAt:record.savedAt,baseFingerprint:ScenarioMapStore.fingerprint(base)}};
    return candidate;
  }
};
