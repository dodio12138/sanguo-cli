import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/data-loader.js");

const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8"));
const rawCities=read("game/data/history/cities/200_guandu.json").cities,profiles=read("game/data/history/city_resource_profiles.json"),loader=new DataLoader({});
const load=id=>{const data={scenario:{id},cities:structuredClone(rawCities),cityResourceProfiles:profiles};loader.applyCityResources(data,id);return data.cities};
const scenarios=Object.fromEntries(["190_coalition","200_guandu","208_red_cliffs"].map(id=>[id,load(id)])),byId=(id,scenario="200_guandu")=>scenarios[scenario].find(city=>city.id===id);

if(Object.keys(profiles.historical_basis).length!==rawCities.length)throw new Error("并非每个据点都有史籍人口基准");
for(const [scenario,cities] of Object.entries(scenarios))for(const city of cities){
  if(!city.historical?.commandery||!city.historical?.censusPopulation)throw new Error(`${scenario}/${city.id} 缺少郡国人口依据`);
  if(city.population<1000||city.garrison<100||city.storage<5000)throw new Error(`${scenario}/${city.id} 资源值超出合理下限`);
  if(city.localFood<0||city.localFood>city.storage||city.localGold<0)throw new Error(`${scenario}/${city.id} 地方库存无效`);
  for(const key of ["agriculture","commerce","order"])if(city[key]<0||city[key]>100)throw new Error(`${scenario}/${city.id} 的 ${key} 超出 0—100`);
}

if(byId("runan").historical.censusPopulation!==2100788||byId("wan").historical.censusPopulation!==2439618||byId("yuzhang").historical.censusPopulation!==1668906)throw new Error("中原、荆州或江南人口基准不正确");
if(!(byId("runan","190_coalition").population>byId("runan").population&&byId("runan").population>byId("runan","208_red_cliffs").population))throw new Error("汝南人口没有体现长期战乱损失");
if(!(byId("luoyang","190_coalition").population>byId("luoyang").population&&byId("luoyang").population>byId("luoyang","208_red_cliffs").population))throw new Error("洛阳人口没有体现董卓之乱后的衰退");
if(!(byId("jianye","208_red_cliffs").population>byId("jianye").population&&byId("jianye").population>byId("jianye","190_coalition").population))throw new Error("江东人口没有体现孙氏经营后的增长");
if(byId("xiangyang","208_red_cliffs").garrison<=byId("xiangyang").garrison||byId("chaisang","208_red_cliffs").garrison<=byId("chaisang").garrison)throw new Error("赤壁前夕荆州和柴桑没有提高战备");
if(byId("runan").agriculture<=byId("shangdang").agriculture||byId("panyu").commerce<=byId("fuling").commerce)throw new Error("农产大郡与海贸港口的资源特征不明显");
if(byId("hulao").storage!==7000||byId("baima").storage!==8000||byId("panyu").storage!==30000)throw new Error("关隘、渡口与港口仓储等级不正确");

console.log("城市资源通过：75 据点史籍基准 / 190·200·208 年人口差异 / 农商治安 / 守军战备 / 地方金粮 / 分级仓储");
