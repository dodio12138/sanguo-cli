import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const reference=read("game/data/history/commandery_population.json"),profilesPath="game/data/history/city_resource_profiles.json",citiesPath="game/data/history/cities/200_guandu.json",adminPath="game/data/history/administrative_divisions.json";
const profiles=read(profilesPath),cityFile=read(citiesPath),admin=read(adminPath),canonical=name=>reference.aliases[name]||name;
const records=reference.records,names=admin.commandery_seats_140.map(seat=>canonical(seat.name));
if(names.length!==105||Object.keys(records).length!==105||new Set(names).size!==105||names.some(name=>!records[name]))throw new Error("人口基准必须覆盖105个不同郡国");
for(const [name,[year,population,source,status,note]] of Object.entries(records)){
  if(!reference.sources[source]?.url||!["recorded","earlier","emended","unrecorded"].includes(status))throw new Error(`${name}缺少有效来源或类型`);
  if(status==="unrecorded"){if(name!=="辽东属国"||year!==null||population!==null||!note)throw new Error(`${name}缺载标记无效`)}
  else if(!Number.isInteger(population)||population<=0||![2,140].includes(year))throw new Error(`${name}人口或年份无效`);
  if(status==="earlier"&&year!==2||status==="emended"&&!note)throw new Error(`${name}前期统计或校勘说明无效`);
}
const regionFor=seat=>({司隶:"central",豫州:"central",兖州:"central",冀州:"north",青州:"north",徐州:"xuzhou",荆州:"jingzhou",扬州:"jiangdong",益州:"yizhou",凉州:"northwest",并州:"north",幽州:"north",交州:"jiaozhou"})[seat.province]||"other";
const seatByCity=new Map(admin.commandery_seats_140.map(seat=>[seat.cityId,seat])),seatByName=new Map(admin.commandery_seats_140.map(seat=>[canonical(seat.name),seat])),oldBasis=profiles.historical_basis,newBasis={};
for(const city of cityFile.cities){
  const seat=seatByCity.get(city.id),old=oldBasis[city.id],name=canonical(seat?.name||old?.[0]||city.commandery),record=records[name];
  if(!record)throw new Error(`据点 ${city.id} 缺少郡国人口基准：${name}`);
  let region=regionFor(seatByName.get(name));
  if(["九江郡","庐江郡"].includes(name))region="huainan";
  if(["辽东郡","辽东属国","玄菟郡","乐浪郡"].includes(name))region="liaodong";
  if(!city.id.startsWith("commandery_city_")&&old?.[3])region=old[3];
  newBasis[city.id]=[name,record[0],record[1],region];city.commandery=name;
}
const counts=new Map();for(const city of cityFile.cities)if((city.type||"city")==="city")counts.set(city.commandery,(counts.get(city.commandery)||0)+1);
const model=reference.city_population_model,estimates={};
for(const city of cityFile.cities.filter(city=>city.id.startsWith("commandery_city_"))){
  const population=records[city.commandery][1],nodes=counts.get(city.commandery);
  if(population!==null)city.population=Math.max(model.minimum,Math.round(population*model.registered_retention*model.urban_share/nodes/model.rounding)*model.rounding);
  if(!Number.isFinite(city.population)||city.population<=0)throw new Error(`${city.name}没有可用城邑人口`);
  estimates[city.id]={baseYear:model.base_year,population:city.population,cityNodes:nodes,method:population===null?"existing_game_estimate":"commandery_urban_share"};
}
profiles.schema_version=2;profiles.methodology=reference.methodology;profiles.population_reference=reference;profiles.historical_basis=newBasis;profiles.city_population_estimates=estimates;
const groups={};for(const [name,counties] of Object.entries(admin.commandery_counties)){const key=canonical(name);groups[key]=[...new Set([...(groups[key]||[]),...counties])]}
admin.commandery_counties=groups;
for(const county of admin.county_seats)county.commandery=canonical(county.commandery);
for(const [name,names] of Object.entries(groups)){
  const local=admin.county_seats.filter(county=>county.commandery===name),record=records[name],population=record?.[1],total=local.reduce((sum,county)=>sum+county.historicalPopulation,0);
  if(!population||!total||local.length!==names.length)throw new Error(`${name}的县域人口或县表无效`);
  let assigned=0;
  for(const [index,county] of local.entries()){
    county.censusYear=record[0];county.historicalPopulation=index===local.length-1?population-assigned:Math.round(population*county.historicalPopulation/total);assigned+=county.historicalPopulation;
    county.populationBasisStatus=record[3];county.populationSource=record[2];
    if(county.historicalPopulation<=0)throw new Error(`${county.name}人口拆分无效`);
  }
  if(assigned!==population)throw new Error(`${name}人口拆分不守恒`);
}
// 只更新人口与统计名称，不重新布置据点、县治、边界或道路。
const changed=[];
for(const [file,value] of [[profilesPath,profiles],[citiesPath,cityFile],[adminPath,admin]]){
  if(JSON.stringify(read(file))===JSON.stringify(value))continue;changed.push(file);
  if(!process.argv.includes("--check"))fs.writeFileSync(path.join(root,file),`${JSON.stringify(value,null,2)}\n`);
}
if(process.argv.includes("--check")&&changed.length){console.error(`人口派生数据未同步：${changed.join("、")}`);process.exitCode=1}
else console.log(`人口基准${process.argv.includes("--check")?"一致":"已同步"}：105郡国 / ${cityFile.cities.length}据点 / ${admin.county_seats.length}县；辽东属国保留游戏估算。`);
