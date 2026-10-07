import fs from "node:fs";

const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const schema=read("game/schema/game-data.schema.json");
const errors=[];
function validate(value,rule,path="$"){
  if(!rule)return;
  const type=Array.isArray(value)?"array":value===null?"null":Number.isInteger(value)?"integer":typeof value;
  if(rule.type&&type!==rule.type&&!(rule.type==="number"&&["number","integer"].includes(type))){errors.push(`${path}: 应为 ${rule.type}，实际为 ${type}`);return}
  if(rule.enum&&!rule.enum.includes(value))errors.push(`${path}: 值 ${JSON.stringify(value)} 不在允许列表中`);
  if(typeof value==="string"){if(rule.minLength&&value.length<rule.minLength)errors.push(`${path}: 字符串不能为空`);if(rule.pattern&&!new RegExp(rule.pattern).test(value))errors.push(`${path}: 格式不符合 ${rule.pattern}`)}
  if(typeof value==="number"){if(rule.minimum!==undefined&&value<rule.minimum)errors.push(`${path}: 不得小于 ${rule.minimum}`);if(rule.maximum!==undefined&&value>rule.maximum)errors.push(`${path}: 不得大于 ${rule.maximum}`)}
  if(Array.isArray(value)){if(rule.minItems&&value.length<rule.minItems)errors.push(`${path}: 至少需要 ${rule.minItems} 项`);if(rule.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)errors.push(`${path}: 含重复项`);value.forEach((item,index)=>validate(item,rule.items,`${path}[${index}]`))}
  if(value&&typeof value==="object"&&!Array.isArray(value)){for(const key of rule.required||[])if(!(key in value))errors.push(`${path}.${key}: 缺少必填字段`);for(const [key,child] of Object.entries(rule.properties||{}))if(key in value)validate(value[key],child,`${path}.${key}`)}
}
const scenario=read("game/data/history/scenarios/200_guandu.json"),map=read("game/data/map/central_plains.json"),commands=read("game/data/common/commands.json"),terrainDefs=read("game/data/common/terrain.json").terrains;
const data={scenario,map:{...map.grid,id:map.id},terrainDefs,forces:read("game/data/history/forces/200_guandu.json").forces,cities:read("game/data/history/cities/200_guandu.json").cities,officers:read("game/data/history/officers/200_guandu.json").officers,armies:read("game/data/history/armies/200_guandu.json").armies,rules:read("game/data/common/game_rules.json"),commandCatalog:{categories:commands.categories,commands:commands.categories.flatMap(category=>category.commands)}};
validate(data,schema);
const forceIds=new Set(data.forces.map(f=>f.id)),cityIds=new Set(data.cities.map(c=>c.id)),seen=new Set();
for(const [index,force] of data.forces.entries()){if(seen.has(force.id))errors.push(`$.forces[${index}].id: 重复 ID ${force.id}`);seen.add(force.id)}
for(const [index,city] of data.cities.entries()){if(!forceIds.has(city.force))errors.push(`$.cities[${index}].force: 未知势力 ${city.force}`);if(city.x>=data.map.width||city.y>=data.map.height)errors.push(`$.cities[${index}]: 坐标 (${city.x},${city.y}) 超出 ${data.map.width}x${data.map.height}`)}
for(const [index,officer] of data.officers.entries()){if(!forceIds.has(officer.force))errors.push(`$.officers[${index}].force: 未知势力 ${officer.force}`);if(officer.city&&!cityIds.has(officer.city))errors.push(`$.officers[${index}].city: 未知城市 ${officer.city}`)}
for(const [index,army] of data.armies.entries()){if(!forceIds.has(army.force))errors.push(`$.armies[${index}].force: 未知势力 ${army.force}`);if(!cityIds.has(army.city))errors.push(`$.armies[${index}].city: 未知城市 ${army.city}`)}
for(const [id,terrain] of Object.entries(terrainDefs)){if(!terrain.name)errors.push(`$.terrainDefs.${id}.name: 缺少显示名称`);if(!/^#[0-9a-f]{6}$/i.test(terrain.color||""))errors.push(`$.terrainDefs.${id}.color: 需要六位十六进制颜色`)}
const personalities=data.rules.balance?.ai?.personalities||{};for(const force of data.forces.filter(f=>f.id!=="neutral")){const profile=personalities[force.id];if(!profile)errors.push(`$.rules.balance.ai.personalities.${force.id}: 缺少势力战略性格`);else{if(!profile.name)errors.push(`$.rules.balance.ai.personalities.${force.id}.name: 缺少名称`);for(const key of ["growth","formation","army_density","aggression","defence","distance","city_value","combat"])if(!Number.isFinite(profile[key])||profile[key]<.5||profile[key]>1.5)errors.push(`$.rules.balance.ai.personalities.${force.id}.${key}: 应为 0.5—1.5`)}}
const catalog=read("game/data/history/scenarios/index.json"),scenarioDefs=new Map();for(const entry of catalog.scenarios){const definition=read(`game/data/history/scenarios/${entry.definition}`);scenarioDefs.set(definition.id,definition);if(definition.id!==entry.id)errors.push(`$.scenarios.${entry.id}: definition ID 不一致`);for(const forceId of definition.playable_forces||[]){if(!definition.force_briefs?.[forceId])errors.push(`$.scenarios.${entry.id}.force_briefs.${forceId}: 缺少势力背景`);if(!definition.objectives?.[forceId])errors.push(`$.scenarios.${entry.id}.objectives.${forceId}: 缺少历史目标`)}}
const events=read("game/data/common/events.json").events,eventIds=new Set();for(const [index,event] of events.entries()){if(eventIds.has(event.id))errors.push(`$.events[${index}].id: 重复 ID ${event.id}`);eventIds.add(event.id);for(const scenarioId of event.trigger?.scenario_ids||[])if(!scenarioDefs.has(scenarioId))errors.push(`$.events[${index}].trigger.scenario_ids: 未知剧本 ${scenarioId}`);const choices=new Set();for(const choice of event.choices||[]){if(choices.has(choice.id))errors.push(`$.events[${index}].choices: 重复选项 ${choice.id}`);choices.add(choice.id)}}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(`数据校验通过：${data.forces.length} 势力 / ${data.cities.length} 据点 / ${data.officers.length} 人物 / ${data.armies.length} 军团 / 105 命令 / ${events.length} 事件`);
