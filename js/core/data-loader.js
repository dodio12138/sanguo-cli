window.DataLoader = class DataLoader {
  constructor(fallback){this.fallback=fallback;this.sources=[];this.warnings=[];this.modReports=[];this.patchOwners=new Map();this.scenarioMaps=window.ScenarioMapStore&&window.MapEditor?new ScenarioMapStore():null;this.scenarioOfficers=window.ScenarioOfficerStore?new ScenarioOfficerStore():null;}
  async load({useSavedMap=true}={}){
    if(location.protocol==="file:"){this.sources.push("embedded:file-fallback");this.scenarioBase=structuredClone(this.fallback);return this.finishScenario(structuredClone(this.scenarioBase),useSavedMap);}
    try{
      const [terrain,unitTypes,items,rules,events,relationships,combatDoctrines,commandDefs,scenario,map,forces,cities,officers,armies,cityResourceProfiles,administrativeDivisions,routeNetwork,hanCourt,clans,officerPostings,officerSupplement,genealogies]=await Promise.all([
        "game/data/common/terrain.json","game/data/common/unit_types.json","game/data/common/items.json","game/data/common/game_rules.json","game/data/common/events.json","game/data/common/officer_relationships.json","game/data/common/combat_doctrines.json","game/data/common/commands.json","game/data/history/scenarios/200_guandu.json","game/data/map/central_plains.json",
        "game/data/history/forces/200_guandu.json","game/data/history/cities/200_guandu.json","game/data/history/officers/200_guandu.json","game/data/history/armies/200_guandu.json","game/data/history/city_resource_profiles.json","game/data/history/administrative_divisions.json","game/data/map/route_network.json","game/data/common/han_court.json","game/data/common/clans.json","game/data/history/officer_postings.json","game/data/history/officers_supplement.json","game/data/common/genealogies.json"
      ].map(path=>this.fetchJson(path)));
      const data=structuredClone(this.fallback);
      data.terrainDefs=Object.fromEntries(Object.entries(terrain.terrains).map(([id,t])=>[id,{...data.terrainDefs[id],...t}]));
      data.unitTypes=unitTypes.unit_types;data.items=items.items;data.rules=rules;data.events=events.events;data.officerRelationships=relationships.relationships;data.combatDoctrines=combatDoctrines;data.commandCatalog=this.normalizeCommands(commandDefs);data.scenario=scenario;data.map={...data.map,...map.grid,...map,id:map.id};data.forces=forces.forces;data.cities=cities.cities;data.officers=officers.officers;data.armies=armies.armies;data.cityResourceProfiles=cityResourceProfiles;data.administrativeDivisions=administrativeDivisions;data.routeNetwork=routeNetwork;data.hanCourt=hanCourt;data.clans=clans.clans||[];data.genealogies=genealogies.families||[];data.officerPostings=officerPostings;data.officerSupplement=officerSupplement;this.mergeOfficerSupplement(data);data.counties=structuredClone(administrativeDivisions.county_seats||[]);this.applyCityResources(data,scenario.id);this.assignCommanderySeatOwners(data,new Set((cities.cities||[]).map(city=>city.id)));this.applyCountyResources(data,scenario.id);
      if(map.layout_archive_file&&map.legacy_revision)data.mapLayouts={[map.legacy_revision]:await this.fetchJson(map.layout_archive_file)};
      if(map.layout_archive_files)data.mapLayouts=Object.fromEntries(await Promise.all(Object.entries(map.layout_archive_files).map(async([revision,file])=>[revision,await this.fetchJson(file)])));
      await this.discoverMods(data);this.scenarioBase=structuredClone(data);return this.finishScenario(data,useSavedMap);
    }catch(error){this.warnings.push(`外部数据读取失败，使用内嵌数据：${error.message}`);this.sources.push("embedded:http-fallback");this.scenarioBase=structuredClone(this.fallback);return this.finishScenario(structuredClone(this.scenarioBase),useSavedMap);}
  }
  async fetchJson(path){const response=await fetch(path,{cache:"no-cache"});if(!response.ok)throw new Error(`${path} (${response.status})`);this.sources.push(path);return response.json();}
  static populationRecord(config,name){
    const reference=config?.population_reference,commandery=reference?.aliases?.[name]||name,raw=reference?.records?.[commandery];
    if(!raw)return null;
    const [year,population,source,status,note]=raw;return {commandery,year,population,source,status,note:note||"",sourceInfo:reference.sources?.[source]};
  }
  static populationHistory(config,name,basis={}){
    const record=DataLoader.populationRecord(config,name);
    if(record)return {commandery:record.commandery,censusYear:record.year,censusPopulation:record.population,populationStatus:record.status,source:record.source,sourceTitle:record.sourceInfo?.title,sourceUrl:record.sourceInfo?.url,note:record.note,method:config.methodology};
    const matches=basis.commandery===name;
    return {commandery:name,censusYear:matches?basis.census_year||null:null,censusPopulation:matches?basis.census_population||null:null,populationStatus:matches&&basis.census_population?"legacy":"unrecorded",method:config.methodology};
  }
  refreshPopulationHistory(data){
    const config=data.cityResourceProfiles;if(!config)return;
    const fields=config.basis_fields||["commandery","census_year","census_population","resource_region"];
    for(const city of data.cities||[]){const raw=config.historical_basis?.[city.id],basis=raw?Object.fromEntries(fields.map((field,index)=>[field,raw[index]])):{};city.historical=DataLoader.populationHistory(config,city.commandery||basis.commandery||"史籍未详",basis)}
  }
  applyCityResources(data,scenarioId=data.scenario?.id||"200_guandu"){
    const config=data.cityResourceProfiles;if(!config)return data;
    const fields=config.basis_fields||["commandery","census_year","census_population","resource_region"],scenario=config.scenarios?.[scenarioId]||config.scenarios?.["200_guandu"]||{},defaults=scenario.default||{},regions=scenario.regions||{},overrides=scenario.cities||{};
    for(const city of data.cities||[]){
      const raw=config.historical_basis?.[city.id],basis=raw?Object.fromEntries(fields.map((field,index)=>[field,raw[index]])):{};
      const adjustment={...defaults,...(regions[basis.resource_region]||{}),...(overrides[city.id]||{})},basePopulation=Number(city.population)||1000,baseGarrison=Number(city.garrison)||0;
      const commandery=basis.commandery||city.commandery||"史籍未详",counties=city.countyNode?[city.name]:data.administrativeDivisions?.commandery_counties?.[commandery]||[city.name];
      city.historical=DataLoader.populationHistory(config,commandery,basis);city.commandery=commandery;if(!city.province)city.province=data.administrativeDivisions?.frontier_commandery_provinces?.[commandery]||data.administrativeDivisions?.commandery_seats_140?.find(seat=>seat.name===commandery)?.province||"";city.counties=[...counties];city.resourceRegion=basis.resource_region||"other";city.resourceScenario=scenarioId;
      city.population=Math.max(1000,Math.round(basePopulation*(adjustment.population??1)/500)*500);city.garrison=Math.max(city.type==="city"?500:100,Math.round(baseGarrison*(adjustment.garrison??1)/100)*100);
      city.agriculture=Math.max(0,Math.min(100,Math.round((city.agriculture||0)+(adjustment.agriculture||0))));city.commerce=Math.max(0,Math.min(100,Math.round((city.commerce||0)+(adjustment.commerce||0))));city.order=Math.max(0,Math.min(100,Math.round((city.order||0)+(adjustment.order||0))));
      const levelCapacity=config.storage_by_level?.[String(city.level||1)]||20000;city.storage=config.type_storage?.[city.harbor?"port":city.type]||levelCapacity;
      const foodRatio=Math.max(.2,Math.min(.95,adjustment.food_stock??.74)),goldFactor=Math.max(.2,adjustment.gold_stock??1);city.localFood=Math.min(city.storage,Math.round(city.storage*foodRatio/100)*100);city.localGold=Math.round((city.population/32+city.commerce*28)*goldFactor/100)*100;city.reserveRatio=city.type==="city"?25:35;
    }
    return data;
  }
  assignCommanderySeatOwners(data,explicitIds){
    const cities=new Map((data.cities||[]).map(city=>[city.id,city])),explicit=explicitIds instanceof Set?explicitIds:new Set(explicitIds||[]),cache=new Map();
    // 基础数据文件与剧本补丁若已显式指定归属，以显式值为准；仅缺省或中立时才沿城市路网向上继承。
    const resolve=city=>{
      if(cache.has(city.id))return cache.get(city.id);
      cache.set(city.id,city.force||"neutral");
      let force=city.force;
      if(!explicit.has(city.id)&&(!force||force==="neutral")){const parent=cities.get(data.rules?.city_graph?.[city.id]?.[0]);force=parent?resolve(parent):"neutral"}
      const value=force||"neutral";cache.set(city.id,value);return value
    };
    for(const city of data.cities||[]){if(!city.id.startsWith("commandery_city_"))continue;city.force=resolve(city);city.governor=data.scenario?.patch?.governors?.[city.id]||city.governor||"—"}
    // 由县治升格的普通县邑随本郡治所归属；剧本补丁显式指定者除外。
    const seats=new Map();for(const city of data.cities||[])if(city.commanderySeatNode&&!seats.has(city.commandery))seats.set(city.commandery,city);
    for(const city of data.cities||[]){if(!city.countyNode)continue;if(!explicit.has(city.id)||!city.force||city.force==="neutral"){const seat=seats.get(city.commandery)||[...(data.cities||[])].filter(item=>!item.countyNode&&item.commandery===city.commandery).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y))[0];city.force=seat?.force||"neutral"}city.governor=data.scenario?.patch?.governors?.[city.id]||city.governor||"—"}
    return data;
  }
  applyCountyResources(data,scenarioId=data.scenario?.id||"200_guandu"){
    const profiles=data.cityResourceProfiles||{},scenario=profiles.scenarios?.[scenarioId]||profiles.scenarios?.["200_guandu"]||{},eraRatio={"190_coalition":.36,"200_guandu":.32,"208_red_cliffs":.29}[scenarioId]??.32;
    if(window.MapGrid?.assignCountyJurisdiction)MapGrid.assignCountyJurisdiction(data.counties||[],data.cities||[],data.administrativeDivisions);
    for(const county of data.counties||[]){
      const city=(data.cities||[]).find(item=>item.id===county.jurisdictionCityId)||(data.cities||[]).filter(item=>item.commandery===county.commandery).sort((a,b)=>Math.hypot(a.x-county.x,a.y-county.y)-Math.hypot(b.x-county.x,b.y-county.y))[0];
      if(!city)continue;county.jurisdictionCityId=city.id;county.force=city.force;const region=city.resourceRegion||"other",adjustment={...(scenario.default||{}),...(scenario.regions?.[region]||{}),...(scenario.cities?.[city.id]||{})},seed=[...county.id].reduce((sum,char)=>sum+char.charCodeAt(0),0),variation=seed%9-4;
      county.population=Math.max(500,Math.round((county.historicalPopulation||5000)*eraRatio*(adjustment.population??1)/100)*100);county.agriculture=Math.max(5,Math.min(100,(city.agriculture||40)+Math.round(variation/2)));county.commerce=Math.max(5,Math.min(100,(city.commerce||35)+(county.rank==="commandery"?4:county.rank==="major"?2:0)-Math.abs(variation)));county.order=Math.max(10,Math.min(100,(city.order||60)+Math.round(variation/2)));county.developmentProgress={agriculture:0,commerce:0,order:0};county.lastIncome={gold:0,food:0};
    }
    return data;
  }
  loadOfficerReference(){return this.officerReferencePromise??=(this.fetchJson("game/data/reference/officers-san11.json"));}
  loadOfficerBiographies(){return this.officerBiographyPromise??=(this.fetchJson("game/data/reference/officer-biographies-san11.json"));}
  loadScenarioCatalog(){return this.scenarioCatalogPromise??=(this.fetchJson("game/data/history/scenarios/index.json"));}
  loadScenarioDefinition(id){return this.fetchJson(`game/data/history/scenarios/${id}.json`);}
  // 人物扩充适配用户已保存的旧节点表，只改新人物/新分驻，不动地图和存档已有的人物。
  static remapRosterOfficers(data,cities,{onlyExpansion=false,officerIds=null,sourceCities=data.cities,sourceMap=data.map,targetMap=data.map}={}){
    if(!cities?.length)return;const ids=new Set(cities.map(c=>c.id)),byId=new Map((sourceCities||[]).map(c=>[c.id,c])),dimensions=m=>({width:m?.width||m?.grid?.width||100,height:m?.height||m?.grid?.height||100}),from=dimensions(sourceMap),to=dimensions(targetMap);
    for(const o of data.officers||[]){if(ids.has(o.city)||officerIds&&!officerIds.has(o.id)||onlyExpansion&&!o.expansionBatch&&!o.stationSource)continue;
      const origin=byId.get(o.city)||byId.get(o.homeCity),serving=["serving","injured"].includes(o.status);let candidates=serving?cities.filter(c=>c.force===o.force):cities;
      if(!candidates.length){o.force="neutral";o.status="hidden";o.loyalty=0;candidates=cities}
      const local=origin&&candidates.filter(c=>c.commandery===origin.commandery);if(local?.length)candidates=local;
      const target=[...candidates].sort((a,b)=>origin?Math.hypot(a.x/to.width-origin.x/from.width,a.y/to.height-origin.y/from.height)-Math.hypot(b.x/to.width-origin.x/from.width,b.y/to.height-origin.y/from.height)||a.id.localeCompare(b.id):a.id.localeCompare(b.id))[0];
      o.city=target.id;o.stationBasis=`${o.stationBasis||o.homeBasis||"新增人物"} 旧地图未含原配置节点，寄于现有${target.name}。`;
    }
  }
  resolveOfficerCity(data,officer,index=0){
    if(officer.homeCity&&(data.cities||[]).some(city=>city.id===officer.homeCity))return officer.homeCity;
    const normalize=value=>String(value||"").replace(/[（(][^）)]*[）)]/gu,"").replace(/[縣县郡城]$/u,"").trim(),aliases={雒阳:"luoyang",洛阳:"luoyang",许县:"xuchang",邺县:"ye",土垠:"beiping",姑臧:"xiliang",临泾:"anding",冀县:"tianshui",宛县:"wan",谯县:"qiao",南郑:"hanzhong",雒县:"zitong",成都县:"chengdu",江州县:"jiangzhou",秣陵:"jianye",寿春县:"shouchun",舒县:"lujiang",吴县:"wu",蓟县:"ji",相县:"xiaopei",郯县:"langya",彭城县:"pengcheng",平舆:"runan",番禺县:"panyu"},cityByName=new Map((data.cities||[]).flatMap(city=>[[city.name,city.id],[normalize(city.name),city.id]])),countyByName=new Map((data.counties||[]).flatMap(county=>[[county.name,county.jurisdictionCityId],[normalize(county.name),county.jurisdictionCityId]]));
    const places=String(officer.discoverPlace||"").split(/[;；、/]/u).map(value=>value.trim()).filter(Boolean);for(const place of places){const clean=normalize(place),id=aliases[place]||aliases[clean]||cityByName.get(place)||cityByName.get(clean)||countyByName.get(place)||countyByName.get(clean);if(id)return id}
    const cities=data.cities||[];return cities.length?cities[(Number(officer.sourceId)||index)%cities.length].id:null;
  }
  // 补录名册（officers_supplement.json）：官渡底本只收开局在世者，按出仕年份记为在野或未登场；其余剧本在 buildScenarioOfficers 中按剧本年份另算。
  mergeOfficerSupplement(data){const year=Number(String(data.scenario?.start_date||"200").split("-")[0]),known=new Set((data.officers||[]).map(o=>o.name));for(const [index,source] of (data.officerSupplement?.officers||[]).entries()){if(known.has(source.name)||source.scenarioScope&&!source.scenarioScope.includes(data.scenario?.id))continue;if(source.deathYear&&source.deathYear<year||source.availableUntilYear&&source.availableUntilYear<year)continue;const officer=structuredClone(source);officer.force="neutral";officer.city=this.supplementCity(data,officer,index);officer.status=(officer.debutYear||year)>year?"not_appeared":"hidden";officer.loyalty=0;officer.merit=0;officer.office="无";officer.officeRank=0;officer.stamina=100;officer.experience=0;officer.skills=[];data.officers.push(officer);known.add(officer.name)}return data}
  // 补录人物在野时落在本郡的原有战略据点（郡治、县治等后补节点在地图改网格时可能被移除）
  supplementCity(data,officer,index){if(officer.homeCity&&(data.cities||[]).some(city=>city.id===officer.homeCity))return officer.homeCity;const id=this.resolveOfficerCity(data,officer,index),generated=cityId=>/^(commandery_city_|xian_)/.test(cityId||"");if(!generated(id))return id;const city=(data.cities||[]).find(c=>c.id===id),core=(data.cities||[]).filter(c=>!generated(c.id));if(!city||!core.length)return id;return (core.find(c=>c.commandery===city.commandery)||core.slice().sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y))[0]).id}
  buildScenarioOfficers(data,scenario,reference){
    const year=Number(String(scenario.start_date).split("-")[0]),assignments=scenario.patch?.officer_assignments||{},assignedNames=new Set(),sources=[...(reference.officers||[])],knownIds=new Set(sources.map(officer=>officer.id));
    for(const officer of data.officers||[])if(!knownIds.has(officer.id)){sources.push(officer);knownIds.add(officer.id)}
    for(const officer of data.officerSupplement?.officers||[])if(!knownIds.has(officer.id)&&!sources.some(item=>item.name===officer.name)){sources.push(officer);knownIds.add(officer.id)}
    // 老剧本的 extra_officers 是姓名清单；只有完整记录才补入名册，参考库已有的人物不重复创建。
    const knownNames=new Set(sources.map(officer=>officer.name));
    for(const officer of scenario.patch?.extra_officers||[]){if(!officer||typeof officer!=="object"||!officer.name||knownNames.has(officer.name)||officer.id&&knownIds.has(officer.id))continue;sources.push(officer);knownNames.add(officer.name);if(officer.id)knownIds.add(officer.id)}
    const rosterNames=scenario.patch?.roster_names?new Set(scenario.patch.roster_names):null;
    const officers=[];for(const [index,original] of sources.entries()){
      const source={...original,...(scenario.patch?.officer_profiles?.[original.name]||{})};for(const key of ["birthYear","deathYear","debutYear"])if(source[key]===null)delete source[key];
      if(rosterNames&&(!rosterNames.has(source.name)||officers.some(o=>o.name===source.name))||source.scenarioScope&&!source.scenarioScope.includes(scenario.id))continue;
      // 参考库卒年与史传冲突时，剧本可在 officer_assignments 中给出 deathYear 校正（null 表示卒年不详），取舍写入 SCENARIO_NOTES.md。
      const assignment=!assignedNames.has(source.name)?assignments[source.name]:null,alive=(!source.deathYear||source.deathYear>=year)&&(!source.availableUntilYear||source.availableUntilYear>=year);if(!assignment&&!alive)continue;if(assignment)assignedNames.add(source.name);
      const officer=structuredClone(source);officer.id=officer.id||`scenario_${scenario.id}_${index+1}`;
      if(assignment){officer.force=assignment.force;officer.city=assignment.city;officer.status=["serving","hidden","free","not_appeared","dead"].includes(assignment.status)?assignment.status:"serving";officer.loyalty=assignment.loyalty??80;for(const key of ["birthYear","deathYear","debutYear"]){if(Object.hasOwn(assignment,key)){if(Number.isFinite(assignment[key]))officer[key]=assignment[key];else delete officer[key]}}for(const key of ["stationBasis","stationSource","stationSourceUrl","stationBasisType","aliases","nameBasis"])if(assignment[key]!=null)officer[key]=structuredClone(assignment[key])}
      else{const availableYear=officer.debutYear||officer.birthYear&&officer.birthYear+15||year;officer.force="neutral";officer.city=officer.statsBasis==="inferred"?this.supplementCity(data,officer,index):this.resolveOfficerCity(data,officer,index);officer.status=availableYear>year?"not_appeared":"hidden";officer.loyalty=0}
      officer.merit??=0;officer.office??="无";officer.officeRank??=0;officer.stamina??=100;officer.experience??=0;officer.skills??=officer.skill?[officer.skill]:[];officers.push(officer);
    }
    return officers;
  }
  async loadScenario(id,{useSavedMap=true}={}){if(id==="200_guandu")return this.finishScenario(structuredClone(this.scenarioBase||await this.load({useSavedMap:false})),useSavedMap);if(location.protocol==="file:")throw new Error("多剧本需要通过静态服务器运行");const scenario=await this.loadScenarioDefinition(id),base=structuredClone(this.scenarioBase||await this.load({useSavedMap:false})),patch=scenario.patch;if(!patch)throw new Error(`${scenario.name}尚未提供剧本数据`);base.scenario=scenario;base.forces=structuredClone(patch.forces);base.cities=base.cities.map(city=>({...city,force:patch.city_forces[city.id]||"neutral",governor:patch.governors?.[city.id]||"—"}));this.applyCityResources(base,id);this.assignCommanderySeatOwners(base,new Set(Object.keys(patch.city_forces||{})));this.applyCountyResources(base,id);const reference=await this.loadOfficerReference();base.officers=this.buildScenarioOfficers(base,scenario,reference);if(patch.roster_names){const holders=new Set(base.officers.flatMap(o=>[o.id,o.name]));for(const item of base.items||[])if(item.owner&&!holders.has(item.owner)){item.owner=null;item.ownerBasis="本期开局持有者未详，不沿用已不在世的早期主人。"}}base.armies=structuredClone(patch.armies||[]);base.scenario.player_force=scenario.default_player_force;base.scenario.playable_forces=scenario.playable_forces;await this.discoverMods(base);return this.finishScenario(base,useSavedMap);}
  applyFamilyCatalog(data){const year=Number(String(data.scenario?.start_date||"200").split("-")[0]);for(const family of data.genealogies||[])for(const [name,profile] of Object.entries(family.people||{}))for(const o of data.officers.filter(o=>o.name===name)){for(const key of ["birthYear","deathYear","debutYear"])if(o[key]==null&&profile[key]!=null)o[key]=profile[key];if(o.birthYear>year&&["hidden","free","discovered"].includes(o.status))o.status="not_appeared"}const known=new Set((data.clans||[]).map(c=>c.id));for(const family of data.genealogies||[]){if(family.scenarioScope&&!family.scenarioScope.includes(data.scenario?.id))continue;if(family.clanId){const clan=data.clans.find(c=>c.id===family.clanId);if(clan){const surname=clan.surname||clan.members?.[0]?.[0],members=[...new Set([...(clan.members||[]),...family.members.filter(n=>n.startsWith(surname))])].filter(n=>!family.excludeMembers?.includes(n));clan.members=members;clan.kin=[...new Map([...(clan.kin||[]),...family.kin].filter(([a,b])=>members.includes(a)&&members.includes(b)).map(edge=>[JSON.stringify(edge),edge])).values()];if(family.basis)clan.basis=family.basis}continue}if(known.has(family.id))continue;const surname=family.members[0]?.[0]||"",members=family.members.filter(n=>n.startsWith(surname)),officers=data.officers.filter(o=>members.includes(o.name)),anchor=officers.find(o=>["serving","injured"].includes(o.status))||officers[0],city=data.cities.find(c=>c.id===anchor?.city)||data.cities[0];if(!city)continue;data.clans.push({id:family.id,name:family.name,surname,commandery:city.commandery,seat:city.name,seat_place:city.name,familyOnly:true,tier:"common",imperial:family.id==="liu_bei",landless:true,land_share:0,landBasis:"亲属家系，无史据不附会世家地产。",wealth:300,talent:50,members,kin:family.kin.filter(([a,b])=>members.includes(a)&&members.includes(b)),basis:family.sources.map(s=>s.title).join("；")});known.add(family.id)}return data}
  async finishScenario(data,useSavedMap){this.applyOfficerPostings(data);this.applyFamilyCatalog(data);return this.applySavedOfficers(await this.finishScenarioMap(data,useSavedMap),useSavedMap)}
  // 开局任官：先按 officer_postings.json 的史载（或演义）太守、守将与随驻人物安置；太守须为本势力在任且驻在该城者，
  // 否则清空。名单未及的人物若在一城扎堆（超过上限），按能力由低到高派往本方空缺城镇，记为推定；县邑只随驻，不授太守。
  applyOfficerPostings(data){const table=data.officerPostings;if(!table||!data.officers?.length)return data;const posts=table.scenarios?.[data.scenario?.id]||[],cities=data.cities||[],officers=data.officers;
    const byName=new Map();for(const officer of officers)if(!byName.has(officer.name)||officer.status==="serving")byName.set(officer.name,officer);
    const cityOf=key=>cities.find(c=>c.id===key)||cities.find(c=>c.name===key&&!c.countyNode)||cities.find(c=>c.name===key),serving=o=>o&&o.status==="serving",pinned=new Set(),skipped=[],vacant=g=>!g||["—","普通官员","无"].includes(g);
    for(const post of posts){const city=cityOf(post.city);if(!city){skipped.push(post.city);continue}
      // 任官表点名的在野或未登场人物：开局时已成年且在世者，就地出仕该城所属势力
      const station=name=>{const o=byName.get(name);if(post.free){if(o&&["hidden","free"].includes(o.status)){o.city=city.id;o.stationBasis=post.basis;o.stationSource=post.source;o.stationSourceUrl=post.sourceUrl}return o}if(post.force&&post.force!==city.force){skipped.push(name);return null}const year=Number(String(data.scenario?.start_date||"200").split("-")[0]),adult=o&&!serving(o)&&["hidden","not_appeared","free"].includes(o.status)&&(!o.birthYear||o.birthYear+14<=year)&&(!o.deathYear||o.deathYear>=year);if(adult&&city.force!=="neutral"){o.force=city.force;o.status="serving";o.loyalty=Math.max(o.loyalty||0,70)}if(!serving(o)||o.force!==city.force){skipped.push(name);return null}o.city=city.id;if(post.expansionBatch){o.stationBasis=post.basis;o.stationSource=post.source;o.stationSourceUrl=post.sourceUrl}pinned.add(o.id);return o};
      if(post.governor&&!city.countyNode){const o=station(post.governor);if(o){city.governor=o.name;city.governorBasis="history"}}for(const name of post.staff||[])station(name)}
    for(const city of cities){if(vacant(city.governor))continue;const o=byName.get(city.governor);if(!serving(o)||o.force!==city.force||o.city!==city.id){city.governor="—";delete city.governorBasis}}
    const caps=table.caps||{capital:16,other:10},family=new Set(table.family||[]),ability=o=>(o.command||0)+(o.war||0)+(o.intelligence||0)+(o.politics||0);
    for(const force of data.forces||[]){if(force.id==="neutral")continue;const ruler=officers.find(o=>o.name===force.name&&o.force===force.id),seats=cities.filter(c=>c.force===force.id&&(c.type||"city")==="city");if(!seats.length)continue;
      const crowd=()=>{const count=new Map();for(const o of officers)if(serving(o)&&o.force===force.id)count.set(o.city,(count.get(o.city)||0)+1);return count};
      for(const [cityId] of [...crowd()].sort((a,b)=>b[1]-a[1])){const city=cities.find(c=>c.id===cityId);if(!city)continue;const cap=ruler?.city===cityId?caps.capital:caps.other;
        const movable=officers.filter(o=>serving(o)&&o.force===force.id&&o.city===cityId&&!pinned.has(o.id)&&!family.has(o.name)&&o!==ruler&&o.name!==city.governor).sort((a,b)=>ability(a)-ability(b));
        for(const officer of movable){const count=crowd();if((count.get(cityId)||0)<=cap)break;const distance=c=>Math.hypot(c.x-city.x,c.y-city.y);
          const target=seats.filter(c=>c.id!==cityId&&vacant(c.governor)&&!count.get(c.id)).sort((a,b)=>distance(a)-distance(b))[0]||seats.filter(c=>c.id!==cityId&&(count.get(c.id)||0)<3).sort((a,b)=>(count.get(a.id)||0)-(count.get(b.id)||0)||distance(a)-distance(b))[0]||seats.filter(c=>c.id!==cityId&&(count.get(c.id)||0)<(ruler?.city===c.id?caps.capital:caps.other)).sort((a,b)=>(count.get(a.id)||0)-(count.get(b.id)||0)||distance(a)-distance(b))[0];if(!target)break;
          officer.city=target.id;officer.stationSource="开局分驻";officer.stationBasis="原驻地人数过多，按本方空缺城镇与距离就近分驻（推定）；县邑随驻不授太守。";if(vacant(target.governor)&&!target.countyNode){target.governor=officer.name;target.governorBasis="estimate"}}}}
    if(skipped.length)this.warnings.push(`开局任官有 ${skipped.length} 项未套用：${[...new Set(skipped)].slice(0,6).join("、")}`);data.meta={...data.meta,officerPostings:{scenario:data.scenario?.id,skipped:[...new Set(skipped)]}};return data}
  // 剧本模板的人物修改在地图之后套用；无效条目跳过并记入警告，不阻止开局。
  async applySavedOfficers(data,useSaved){if(!useSaved||!this.scenarioOfficers||!data?.scenario?.id)return data;try{const record=await this.scenarioOfficers.get(data.scenario.id);if(record){const result=ScenarioOfficerStore.apply(data,record);this.sources.push(`saved-officers:${data.scenario.id}`);if(result.skipped.length)this.warnings.push(`人物修改有 ${result.skipped.length} 项未套用：${result.skipped.slice(0,3).join("；")}`);data.meta={...data.meta,scenarioOfficers:{applied:result.applied,skipped:result.skipped.length}}}}catch(error){this.warnings.push(`人物修改未自动载入：${error.message}`)}return data}
  async finishScenarioMap(data,useSavedMap){
    this.validate(data);
    if(!useSavedMap||!this.scenarioMaps)return data;
    const baseFingerprint=ScenarioMapStore.fingerprint(data);
    try{
      const record=await this.scenarioMaps.get(data.scenario.id);
      if(record){const saved=ScenarioMapStore.prepare(data,record);this.validate(saved);this.sources.push(`saved-map:${data.scenario.id}`);return saved}
      data.meta={...data.meta,scenarioMap:{status:"original",baseFingerprint}};
    }catch(error){this.warnings.push(`剧本地图未自动载入：${error.message}`);data.meta={...data.meta,scenarioMap:{status:"unavailable",message:error.message,baseFingerprint}}}
    return this.validate(data);
  }
  async discoverMods(data){
    // 浏览器不能枚举目录；注册表决定启用的模组及加载顺序。
    this.modReports=[];this.patchOwners.clear();
    let registry;try{registry=await this.fetchJson("mods/registry.json")}catch(error){this.modReports.push({id:"registry",status:"missing",errors:[error.message]});return}
    let settings={};try{settings=JSON.parse(localStorage.getItem("sanguo.mod.settings.v1")||"{}")||{}}catch{}const mods=[...(registry.mods||[])].map(mod=>({...mod,...(settings[mod.id]||{})})).sort((a,b)=>(a.load_order||0)-(b.load_order||0));
    for(const mod of mods){
      const report={id:mod.id,name:mod.id,enabled:Boolean(mod.enabled),loadOrder:mod.load_order||0,status:mod.enabled?"loading":"disabled",patches:[],overrides:[],conflicts:[],warnings:[],errors:[]};this.modReports.push(report);
      if(!mod.enabled)continue;
      try{
        const manifest=await this.fetchJson(`mods/${mod.id}/manifest.json`),manifestErrors=this.validateModManifest(manifest,mod.id);if(manifestErrors.length)throw new Error(manifestErrors.join("；"));report.name=manifest.name||mod.id;report.version=manifest.version||"?";report.manifest=manifest;
        if(manifest.id!==mod.id)report.warnings.push(`manifest id ${manifest.id||"缺失"} 与注册表 ${mod.id} 不一致`);
        const paths=manifest.patches?.length?manifest.patches:["data.patch.json"];
        for(const file of paths){const patch=await this.fetchJson(`mods/${mod.id}/${file}`);report.patches.push(file);this.applyPatch(data,patch,{modId:mod.id,report});}
        report.status="loaded";this.sources.push(`mod:${mod.id}`);
      }catch(error){report.status="error";report.errors.push(error.message);this.warnings.push(`模组 ${mod.id} 未加载：${error.message}`)}
    }
  }
  validateModManifest(manifest,expectedId){const errors=[];for(const key of ["id","name","version","game_version"])if(!manifest?.[key])errors.push(`$.${key}: 缺少必填字段`);if(manifest?.id&&!/^[a-z0-9][a-z0-9_-]*$/.test(manifest.id))errors.push("$.id: 只允许小写字母、数字、下划线和连字号");if(manifest?.id&&manifest.id!==expectedId)errors.push(`$.id: ${manifest.id} 与注册表 ${expectedId} 不一致`);if(manifest?.patches&&!Array.isArray(manifest.patches))errors.push("$.patches: 必须是数组");return errors}
  applyPatch(target,patch,context={},prefix=""){for(const [key,value] of Object.entries(patch)){const path=prefix?`${prefix}.${key}`:key;if(value&&typeof value==="object"&&!Array.isArray(value)&&target[key]&&typeof target[key]==="object"&&!Array.isArray(target[key]))this.applyPatch(target[key],value,context,path);else{if(context.modId){const previous=this.patchOwners.get(path);if(previous&&previous!==context.modId)context.report.conflicts.push({path,previous,current:context.modId});else if(Object.prototype.hasOwnProperty.call(target,key))context.report.overrides.push(path);this.patchOwners.set(path,context.modId)}target[key]=structuredClone(value)}}}
  normalizeCommands(defs){const categories=defs.categories.map(({id,name})=>({id,name})),commands=[];for(const category of defs.categories)for(const entry of category.commands){const command=Array.isArray(entry)?{id:entry[0],name:entry[1],status:entry[2]||"planned"}:entry;commands.push({...command,description:command.description||window.SANGUO_COMMAND_DESCRIPTION?.(command.id,command.name,category.id)||`${command.name}：加入本旬命令队列。`,categoryId:category.id,categoryName:category.name,parameters:command.parameters||["actor_id","target_ids","amount","options"]})}return {schemaVersion:defs.schema_version,categories,commands};}
  diagnose(data){
    const errors=[],warnings=[];if(!data.map||!Number.isInteger(data.map.width)||!Number.isInteger(data.map.height))errors.push("地图尺寸无效");
    for(const [id,terrain] of Object.entries(data.terrainDefs||{})){if(!terrain.name)errors.push(`地形 ${id} 缺少名称`);if(!/^#[0-9a-f]{6}$/i.test(terrain.color||""))errors.push(`地形 ${id} 颜色无效`)}
    for(const key of ["forces","cities"]){if(!Array.isArray(data[key]))errors.push(`${key} 必须是数组`)}
    const ids=new Set();for(const force of data.forces||[]){if(!force.id||ids.has(force.id))errors.push(`势力 ID 无效或重复：${force.id}`);ids.add(force.id)}
    for(const city of data.cities||[]){if(!city.id||!ids.has(city.force))errors.push(`城市 ${city.id||"?"} 的势力引用无效`);if(city.x<0||city.y<0||city.x>=data.map.width||city.y>=data.map.height)errors.push(`城市 ${city.id} 坐标越界`);city.localGold??=Math.round(city.population/20);city.localFood??=Math.round(city.population/8);city.storage??=20000;city.labor??=0;city.buildings??=[];city.defenseDamage??=0;city.reserveRatio??=25}
    const countyCells=new Set,countyIds=new Set,commanderyNames=new Set(Object.keys(data.administrativeDivisions?.commandery_counties||{})),cityIdSet=new Set((data.cities||[]).map(city=>city.id));
    if(data.map?.editorVersion===1&&window.MapGrid){for(const name of MapGrid.decodeLayer(data.map,"commanderies",data.map.width,data.map.height)||[])if(name)commanderyNames.add(name);commanderyNames.add("")}
    for(const county of data.counties||[]){const cell=`${county.x},${county.y}`;if(!county.id||countyIds.has(county.id))errors.push(`县治 ID 无效或重复：${county.id||"?"}`);countyIds.add(county.id);if(countyCells.has(cell))errors.push(`县治网格重叠：${cell}`);countyCells.add(cell);if(!commanderyNames.has(county.commandery))errors.push(`县治 ${county.name} 的郡属无效：${county.commandery}`);if(county.x<0||county.y<0||county.x>=data.map.width||county.y>=data.map.height)errors.push(`县治 ${county.name} 坐标越界`);if(!Number.isFinite(county.historicalPopulation)||county.historicalPopulation<=0||!Number.isFinite(county.population)||county.population<=0)errors.push(`县治 ${county.name} 人口无效`);if(!cityIdSet.has(county.jurisdictionCityId))errors.push(`县治 ${county.name} 缺少有效管辖据点`);if(county.cityId){const city=(data.cities||[]).find(item=>item.id===county.cityId);if(!city||city.x!==county.x||city.y!==county.y)errors.push(`县治 ${county.name} 未与据点 ${county.cityId} 对齐`)}}
    const cityIds=new Set((data.cities||[]).map(city=>city.id)),officerIds=new Set(),statuses=new Set(["serving","injured","free","hidden","discovered","prisoner","wandering","exiled","not_appeared","dead"]);for(const officer of data.officers||[]){if(!officer.id||officerIds.has(officer.id))errors.push(`人物 ID 无效或重复：${officer.id||"?"}`);officerIds.add(officer.id);if(!ids.has(officer.force))errors.push(`人物 ${officer.name} 势力引用无效`);if(officer.city&&!cityIds.has(officer.city))errors.push(`人物 ${officer.name} 城市引用无效`);if(!statuses.has(officer.status))errors.push(`人物 ${officer.name} 状态无效：${officer.status}`)}
    const officerNames=new Set((data.officers||[]).map(o=>o.name)),armyIds=new Set();for(const army of data.armies||[]){if(!army.id||armyIds.has(army.id))errors.push(`军团 ID 无效或重复：${army.id||"?"}`);armyIds.add(army.id);if(!ids.has(army.force))errors.push(`军团 ${army.name} 势力引用无效`);if(!cityIds.has(army.city))errors.push(`军团 ${army.name} 驻地引用无效`);if(!Number.isFinite(army.soldiers)||army.soldiers<0)errors.push(`军团 ${army.name} 兵力无效`);if(army.commander&&!officerNames.has(army.commander))warnings.push(`军团 ${army.name} 主将未出现在人物表：${army.commander}`);if(army.units){const total=Object.values(army.units).reduce((n,v)=>n+(Number(v)||0),0);if(total!==army.soldiers)errors.push(`军团 ${army.name} 编制 ${total} 与兵力 ${army.soldiers} 不一致`)}}
    for(const army of data.armies||[])for(const deputyId of army.deputyOfficerIds||[]){const deputy=(data.officers||[]).find(o=>o.id===deputyId);if(!deputy)errors.push(`军团 ${army.name} 副将引用无效：${deputyId}`);else if(deputy.force!==army.force)warnings.push(`军团 ${army.name} 副将 ${deputy.name} 与军团势力不一致`)}
    for(const army of data.armies||[]){if(data.combatDoctrines&&!data.combatDoctrines.formations?.[army.formation])errors.push(`军团 ${army.name} 阵型无效：${army.formation}`);if(data.combatDoctrines&&!data.combatDoctrines.tactics?.[army.tactic])errors.push(`军团 ${army.name} 战术无效：${army.tactic}`)}
    for(const [from,targets] of Object.entries(data.rules?.city_graph||{})){if(!cityIds.has(from))errors.push(`道路起点不存在：${from}`);for(const to of targets){if(!cityIds.has(to))errors.push(`道路终点不存在：${to}`);else if(!(data.rules.city_graph[to]||[]).includes(from))errors.push(`道路不是双向连接：${from} → ${to}`)}}
    const commandIds=new Set();for(const command of data.commandCatalog?.commands||[]){if(!command.id||commandIds.has(command.id))errors.push(`命令 ID 无效或重复：${command.id||"?"}`);commandIds.add(command.id)}
    const eventIds=new Set();for(const event of data.events||[]){if(!event.id||eventIds.has(event.id))errors.push(`事件 ID 无效或重复：${event.id||"?"}`);eventIds.add(event.id);if(!event.name||!event.text)errors.push(`事件 ${event.id||"?"} 缺少名称或正文`);const choiceIds=new Set();for(const choice of event.choices||[]){if(!choice.id||choiceIds.has(choice.id))errors.push(`事件 ${event.id} 的选项 ID 无效或重复：${choice.id||"?"}`);choiceIds.add(choice.id);if(!choice.label)errors.push(`事件 ${event.id} 的选项缺少标题`)}}
    for(const forceId of data.scenario?.playable_forces||[]){if(!ids.has(forceId))errors.push(`可选势力不存在：${forceId}`);if(!(data.cities||[]).some(c=>c.force===forceId))errors.push(`可选势力没有据点：${forceId}`);if(!(data.officers||[]).some(o=>o.force===forceId&&o.status==="serving"))errors.push(`可选势力没有在仕人物：${forceId}`)}
    for(const item of data.items||[]){if(item.owner&&!officerIds.has(item.owner)&&!officerNames.has(item.owner))warnings.push(`宝物 ${item.name||item.id} 持有者不存在：${item.owner}`)}
    return {ok:errors.length===0,errors,warnings,stats:{forces:(data.forces||[]).length-((data.forces||[]).some(f=>f.id==="neutral")?1:0),cities:(data.cities||[]).length,counties:(data.counties||[]).length,officers:(data.officers||[]).length,armies:(data.armies||[]).length,commands:(data.commandCatalog?.commands||[]).length,events:(data.events||[]).length,map:`${data.map?.width||0}×${data.map?.height||0}`}};
  }
  validate(data){
    const byName=new Map((data.officers||[]).map(officer=>[officer.name,officer]));
    for(const relation of data.officerRelationships||[]){
      const present=relation.members.filter(name=>byName.has(name));
      for(const name of present){const officer=byName.get(name);officer.historicalRelations??=[];for(const other of present.filter(n=>n!==name))if(!officer.historicalRelations.some(r=>r.type===relation.type&&r.name===other))officer.historicalRelations.push({type:relation.type,name:other})}
    }
    for(const army of data.armies||[]){
      army.deputyOfficerIds??=(data.officers||[]).filter(officer=>officer.force===army.force&&officer.city===army.city&&officer.status==="serving"&&officer.name!==army.commander).sort((a,b)=>(b.command+b.war+b.intelligence)-(a.command+a.war+a.intelligence)).slice(0,2).map(officer=>officer.id);
      const commander=byName.get(army.commander),units=army.units||{};
      army.formation??=(units.cavalry||0)>army.soldiers*.5?"wedge":(units.archers||0)>army.soldiers*.5?"crane_wing":"balanced";
      army.tactic??=(commander?.war||0)>(commander?.intelligence||0)+15?"aggressive":(commander?.intelligence||0)>(commander?.war||0)+15?"cautious":"balanced";
    }
    const diagnostics=this.diagnose(data);if(diagnostics.errors.length)throw new Error(`数据校验失败：${diagnostics.errors.join("；")}`);
    data.meta={...data.meta,sources:[...this.sources],warnings:[...this.warnings,...diagnostics.warnings],mods:structuredClone(this.modReports),diagnostics};return data;
  }
};
