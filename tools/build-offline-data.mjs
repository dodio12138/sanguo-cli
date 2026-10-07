import fs from "node:fs";
globalThis.window=globalThis;
await import("../js/data/command-catalog.js");
await import("../js/core/data-loader.js");

const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const scenario=read("game/data/history/scenarios/200_guandu.json"),map=read("game/data/map/central_plains.json"),commands=read("game/data/common/commands.json"),terrain=read("game/data/common/terrain.json");
const payload={
  scenario,map:{...map.grid,id:map.id},
  terrainDefs:Object.fromEntries(Object.entries(terrain.terrains).map(([id,value])=>[id,value])),
  unitTypes:read("game/data/common/unit_types.json").unit_types,
  items:read("game/data/common/items.json").items,
  rules:read("game/data/common/game_rules.json"),events:read("game/data/common/events.json").events,
  officerRelationships:read("game/data/common/officer_relationships.json").relationships,
  combatDoctrines:read("game/data/common/combat_doctrines.json"),
  cityResourceProfiles:read("game/data/history/city_resource_profiles.json"),
  administrativeDivisions:read("game/data/history/administrative_divisions.json"),
  forces:read(scenario.data_files.forces).forces,cities:read(scenario.data_files.cities).cities,
  officers:read(scenario.data_files.officers).officers,armies:read(scenario.data_files.armies).armies,
  commandCatalog:{schemaVersion:commands.schema_version,categories:commands.categories.map(({id,name})=>({id,name})),commands:commands.categories.flatMap(category=>category.commands.map(entry=>{const [id,name,status="active"]=entry;return {id,name,status,description:window.SANGUO_COMMAND_DESCRIPTION(id,name,category.id),categoryId:category.id,categoryName:category.name,parameters:["actor_id","target_ids","amount","options"]}}))}
};
payload.counties=structuredClone(payload.administrativeDivisions.county_seats||[]);
new window.DataLoader(payload).applyCityResources(payload,scenario.id);
const output=`// 由 tools/build-offline-data.mjs 自动生成；不要手工编辑。\nwindow.SANGUO_DATA=Object.assign(window.SANGUO_DATA||{},${JSON.stringify(payload)});\n`;
fs.writeFileSync("js/data/offline-data.generated.js",output);
console.log(`离线镜像已生成：${payload.officers.length} 人物 / ${payload.cities.length} 据点 / ${payload.commandCatalog.commands.length} 命令`);
