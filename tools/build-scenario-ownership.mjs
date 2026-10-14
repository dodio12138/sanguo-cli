import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const write=process.argv.includes("--write");
const scenarioId=process.argv.find(arg=>arg.startsWith("--scenario="))?.slice("--scenario=".length);
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));

// 汉兴郡分自右扶风，各剧本随右扶风归属。
// 郡国 → [200 官渡, 190 反董卓联合, 208 赤壁, 194 濮阳, 211 潼关, 219 襄阳] 归属；郡国名取自 cities/200_guandu.json 的 commandery 字段。
// 《后汉书·郡国志》建置与汉末牧守传记的战略投影；后设郡沿母郡继承，非逐县实控考证。
// 190 年据《三国志》卷一、七、四十九及《后汉书》卷五十补齐；194/211/219 年取舍同见 SCENARIO_NOTES.md。
const COMMANDERY_OWNERS={
  // 定稿郡界外的废并郡国：沿用据点现有归属。
  "张掖郡":["handan_shang","ma_teng","zhang_meng","handan_shang","han_sui","cao"],"酒泉郡":["handan_shang","ma_teng","zhang_meng","handan_shang","neutral","cao"],"敦煌郡":["handan_shang","ma_teng","zhang_meng","handan_shang","neutral","cao"],"张掖居延属国":["handan_shang","ma_teng","zhang_meng","handan_shang","neutral","cao"],"上郡":["yuan","neutral","cao","neutral","cao","cao"],"西河郡":["yuan","neutral","cao","neutral","cao","cao"],"云中郡":["yuan","neutral","cao","neutral","cao","cao"],"定襄郡":["yuan","neutral","cao","neutral","cao","cao"],"朔方郡":["yuan","neutral","cao","neutral","cao","cao"],
  "河南尹":["cao","dong","cao","neutral","cao","cao"],"恒农郡":["cao","dong","cao","li_jue","cao","cao"],"京兆尹":["cao","dong","cao","li_jue","ma_chao","cao"],
  "左冯翊":["cao","dong","cao","li_jue","ma_chao","cao"],"右扶风":["ma_teng","dong","ma_chao","li_jue","ma_chao","cao"],"汉兴郡":["ma_teng","dong","ma_chao","li_jue","ma_chao","cao"],
  "河东郡":["cao","dong","cao","li_jue","cao","cao"],"河内郡":["cao","wang_kuang","cao","zhang_yang","cao","cao"],
  "颍川郡":["cao","kong_zhou","cao","neutral","cao","cao"],"汝南郡":["cao","yuan_shu","cao","yuan_shu","cao","cao"],"梁国":["cao","kong_zhou","cao","neutral","cao","cao"],
  "陈郡":["cao","liu_chong","cao","liu_chong","cao","cao"],"鲁国":["cao","kong_zhou","cao","neutral","cao","cao"],"谯郡":["cao","cao","cao","cao","cao","cao"],
  "沛郡":["liu","kong_zhou","cao","liu","cao","cao"],"弋阳郡":["cao","yuan_shu","cao","yuan_shu","cao","cao"],"蕲新郡":["cao","yuan_shu","sun","yuan_shu","sun","sun"],
  "陈留郡":["cao","zhang_miao","cao","lu_bu","cao","cao"],"东郡":["cao","qiao_mao","cao","lu_bu","cao","cao"],"济阴国":["cao","liu_dai","cao","lu_bu","cao","cao"],
  "山阳国":["cao","yuan_yi","cao","lu_bu","cao","cao"],"任城国":["cao","liu_dai","cao","lu_bu","cao","cao"],"东平国":["cao","liu_dai","cao","lu_bu","cao","cao"],
  "济北国":["cao","bao_xin","cao","lu_bu","cao","cao"],"泰山郡":["cao","liu_dai","cao","lu_bu","cao","cao"],
  "下邳国":["liu","tao_qian","cao","tao_qian","cao","cao"],"彭城国":["liu","tao_qian","cao","tao_qian","cao","cao"],"琅邪国":["liu","tao_qian","cao","tao_qian","cao","cao"],
  "东海国":["liu","tao_qian","cao","tao_qian","cao","cao"],"东莞郡":["liu","tao_qian","cao","tao_qian","cao","cao"],"利城郡":["liu","tao_qian","cao","tao_qian","cao","cao"],
  "城阳郡":["liu","tao_qian","cao","tao_qian","cao","cao"],"广陵郡":["liu","zhang_chao","cao","tao_qian","cao","cao"],
  "魏郡":["yuan","han_fu","cao","yuan","cao","cao"],"渤海郡":["yuan","yuan","cao","yuan","cao","cao"],"常山国":["yuan","han_fu","cao","yuan","cao","cao"],
  "中山国":["yuan","han_fu","cao","yuan","cao","cao"],"安平国":["yuan","han_fu","cao","yuan","cao","cao"],"河间国":["yuan","han_fu","cao","yuan","cao","cao"],
  "甘陵郡":["yuan","han_fu","cao","yuan","cao","cao"],"赵郡":["yuan","han_fu","cao","yuan","cao","cao"],"巨鹿郡":["yuan","han_fu","cao","yuan","cao","cao"],
  "博陵国":["yuan","han_fu","cao","yuan","cao","cao"],"章武郡":["yuan","han_fu","cao","yuan","cao","cao"],
  "太原郡":["yuan","neutral","cao","neutral","cao","cao"],"上党郡":["yuan","neutral","cao","zhang_yang","cao","cao"],"雁门郡":["yuan","neutral","cao","neutral","cao","cao"],
  "新兴郡":["yuan","neutral","cao","neutral","cao","cao"],"乐平郡":["yuan","neutral","cao","zhang_yan","cao","cao"],
  "右北平郡":["yuan","gongsun","cao","gongsun","cao","cao"],"代郡":["yuan","liu_yu","cao","gongsun","cao","cao"],"广阳郡":["yuan","liu_yu","cao","gongsun","cao","cao"],
  "涿郡":["yuan","liu_yu","cao","gongsun","cao","cao"],"上谷郡":["yuan","liu_yu","cao","gongsun","cao","cao"],"渔阳郡":["yuan","liu_yu","cao","gongsun","cao","cao"],
  "辽东郡":["gongsun_du","gongsun_du","gongsun_kang","gongsun_du","gongsun_kang","gongsun_kang"],"辽西郡":["yuan","liu_yu","cao","gongsun","cao","cao"],
  "辽东属国":["gongsun_du","gongsun_du","gongsun_kang","gongsun_du","gongsun_kang","gongsun_kang"],
  "平原郡":["yuan","jiao_he","cao","gongsun","cao","cao"],"北海国":["yuan","kong_rong","cao","kong_rong","cao","cao"],"齐郡":["yuan","jiao_he","cao","gongsun","cao","cao"],
  "济南国":["yuan","jiao_he","cao","gongsun","cao","cao"],"安乐国":["yuan","jiao_he","cao","gongsun","cao","cao"],"东莱郡":["yuan","jiao_he","cao","gongsun","cao","cao"],
  "乐陵郡":["yuan","jiao_he","cao","gongsun","cao","cao"],
  "武威郡":["zhang_meng","ma_teng","zhang_meng","handan_shang","han_sui","cao"],"汉阳郡":["wei_duan","ma_teng","wei_kang","ma_teng","cao","cao"],
  "陇西郡":["wei_duan","ma_teng","wei_kang","ma_teng","cao","cao"],"西郡":["handan_shang","ma_teng","zhang_meng","handan_shang","han_sui","cao"],
  "金城郡":["han_sui","han_sui","han_sui","han_sui","han_sui","cao"],"安定郡":["han_sui","han_sui","han_sui","han_sui","han_sui","cao"],
  "北地郡":["han_sui","han_sui","han_sui","han_sui","han_sui","cao"],"西平郡":["han_sui","han_sui","han_sui","han_sui","han_sui","cao"],
  "武都郡":["zhang_lu","neutral","zhang_lu","zhang_lu","zhang_lu","cao"],"汉中郡":["zhang_lu","liu_yan","zhang_lu","zhang_lu","zhang_lu","liu"],
  "上庸郡":["zhang_lu","liu_yan","zhang_lu","zhang_lu","zhang_lu","liu"],"西城郡":["zhang_lu","liu_yan","zhang_lu","zhang_lu","zhang_lu","liu"],
  "房陵郡":["liu_biao","liu_biao","zhang_lu","liu_biao","cao","liu"],
  "梓潼郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"蜀郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "巴郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"巴西郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "巴东属国":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"广汉郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "广汉属国":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"蜀郡属国":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "犍为郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"犍为属国":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "越巂郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"益州郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "江阳郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"汶山郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "宕渠郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"阴平郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "朱提郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],"固陵郡":["liu_zhang","liu_yan","liu_zhang","liu_zhang","liu_zhang","liu"],
  "南阳郡":["cao","yuan_shu","cao","liu_biao","cao","cao"],"襄阳郡":["liu_biao","liu_biao","cao","liu_biao","cao","cao"],
  "南郡":["liu_biao","liu_biao","cao","liu_biao","liu","liu"],"江夏郡":["liu_biao","liu_biao","liu","liu_biao","sun","sun"],
  "章陵郡":["liu_biao","liu_biao","cao","liu_biao","cao","cao"],"南乡郡":["liu_biao","yuan_shu","cao","liu_biao","cao","cao"],
  "宜都郡":["liu_biao","liu_biao","cao","liu_biao","liu","liu"],"武陵郡":["liu_biao","liu_biao","jin_xuan","liu_biao","liu","liu"],
  "长沙郡":["liu_biao","sun_jian","han_xuan","liu_biao","liu","sun"],"零陵郡":["liu_biao","liu_biao","liu_du","liu_biao","liu","liu"],
  "桂阳郡":["liu_biao","liu_biao","zhao_fan","liu_biao","liu","sun"],
  "丹阳郡":["sun","zhou_xin","sun","liu_yao","sun","sun"],"吴郡":["sun","chen_wen","sun","liu_yao","sun","sun"],"会稽郡":["sun","chen_wen","sun","wang_lang","sun","sun"],
  "豫章郡":["sun","chen_wen","sun","liu_yao","sun","sun"],"庐江郡":["sun","chen_wen","sun","neutral","cao","sun"],"庐陵郡":["sun","chen_wen","sun","liu_yao","sun","sun"],
  "鄱阳郡":["sun","chen_wen","sun","liu_yao","sun","sun"],"九江郡":["cao","chen_wen","cao","yuan_shu","cao","cao"],
  "交趾郡":["shi_xie","shi_xie","shi_xie","shi_xie","shi_xie","shi_xie"],"南海郡":["shi_xie","neutral","shi_xie","neutral","shi_xie","sun"],
  "郁林郡":["zhang_jin","neutral","shi_xie","neutral","shi_xie","shi_xie"],"合浦郡":["shi_xie","neutral","shi_xie","neutral","shi_xie","shi_xie"]
};

// 个别据点在所属郡之外单独归属：渡津、关隘、郡治兼战略节点、史籍错配的县治与塞外据点。
const CITY_OWNERS={
  "200_guandu":{
    "jiameng":"liu_zhang","jiangyou":"liu_zhang",
    "qiao":"cao","xiaopei":"liu","xinye":"liu_biao","wan":"cao","wuguan":"cao",
    "commandery_city_011":"liu","commandery_city_105":"neutral","commandery_city_100":"zhang_jin","cangwu":"zhang_jin",
    "baima":"cao","yanjin":"cao","puyang":"cao","xuchang":"cao","guandu":"cao","hulao":"cao","hangu":"cao",
    "tongguan":"cao","changan":"cao","luoyang":"cao","mengjin":"cao","henei":"cao","shangyong":"zhang_lu",
    "yiling":"liu_biao","yongan":"liu_zhang","fuling":"liu_zhang","jianmen":"liu_zhang",
    "commandery_city_074":"handan_shang","commandery_city_075":"handan_shang","commandery_city_076":"handan_shang",
    "commandery_city_078":"handan_shang","commandery_city_081":"yuan","commandery_city_082":"yuan",
    "commandery_city_084":"yuan","commandery_city_085":"yuan","commandery_city_087":"yuan"
  },
  "190_coalition":{
    "jiameng":"liu_yan","jiangyou":"liu_yan",
    "qiao":"cao","xiaopei":"tao_qian","xinye":"liu_biao","wan":"yuan_shu","wuguan":"dong","guandu":"kong_zhou",
    "commandery_city_011":"kong_zhou","commandery_city_104":"neutral","commandery_city_105":"neutral","commandery_city_100":"neutral","cangwu":"neutral",
    "xiapi":"tao_qian","pengcheng":"tao_qian","langya":"tao_qian","guangling":"zhang_chao","runan":"yuan_shu",
    "hulao":"dong","hangu":"dong","tongguan":"dong","changan":"dong","luoyang":"dong","mengjin":"dong",
    "henei":"wang_kuang","shangyong":"liu_yan","yiling":"liu_biao","yongan":"liu_yan",
    "fuling":"liu_yan","jianmen":"liu_yan","chenliu":"zhang_miao","baima":"qiao_mao","yanjin":"qiao_mao","puyang":"qiao_mao",
    "commandery_city_074":"ma_teng","commandery_city_075":"ma_teng","commandery_city_076":"ma_teng",
    "commandery_city_078":"ma_teng","commandery_city_081":"neutral","commandery_city_082":"neutral",
    "commandery_city_084":"neutral","commandery_city_085":"neutral","commandery_city_087":"neutral"
  },
  "208_red_cliffs":{
    "jiameng":"liu_zhang","jiangyou":"liu_zhang",
    "qiao":"cao","xiaopei":"cao","xinye":"cao","wan":"cao","wuguan":"cao",
    "commandery_city_011":"cao","commandery_city_105":"neutral","commandery_city_100":"wu_ju","cangwu":"wu_ju",
    "xiakou":"liu","yiling":"cao","chaisang":"sun","pukou":"sun","shouchun":"cao","hefei":"cao",
    "hulao":"cao","hangu":"cao","tongguan":"cao","changan":"cao","luoyang":"cao","mengjin":"cao","henei":"cao",
    "shangyong":"zhang_lu","yongan":"liu_zhang","fuling":"liu_zhang","jianmen":"liu_zhang","hanzhong":"zhang_lu",
    "yangping":"zhang_lu","commandery_city_074":"zhang_meng","commandery_city_075":"zhang_meng",
    "commandery_city_076":"zhang_meng","commandery_city_078":"zhang_meng","commandery_city_081":"cao",
    "commandery_city_082":"cao","commandery_city_084":"cao","commandery_city_085":"cao","commandery_city_087":"cao"
  },
  // 吕布据濮阳，兖州郡县皆应，唯鄄城、东阿（范县无节点）为曹操固守；刘备以豫州刺史屯小沛。
  "194_puyang":{
    "jiameng":"liu_zhang","jiangyou":"liu_zhang","jianmen":"liu_zhang","yongan":"liu_zhang","fuling":"liu_zhang",
    "qiao":"cao","xian_extra_04":"cao","xian_06_04":"cao",
    "xiaopei":"liu","commandery_city_011":"liu","xinye":"liu_biao","wan":"liu_biao","yiling":"liu_biao",
    "wuguan":"li_jue","shangyong":"zhang_lu","hanzhong":"zhang_lu","yangping":"zhang_lu",
    "commandery_city_105":"neutral","commandery_city_100":"neutral","cangwu":"neutral"
  },
  // 关西十部屯潼关拒曹；刘备借南郡，孙权据江夏东部与陆口；庐江皖城仍为曹军，寻阳属吴；步骘已入苍梧。
  "211_tongguan":{
    "jiameng":"liu_zhang","jiangyou":"liu_zhang","jianmen":"liu_zhang","yongan":"liu_zhang","fuling":"liu_zhang",
    "tongguan":"ma_chao","hangu":"cao","qiao":"cao","xiaopei":"cao","xinye":"cao","wan":"cao","yiling":"liu",
    "xiakou":"sun","xian_extra_14":"sun","xian_extra_15":"sun","pukou":"sun","xian_35_05":"sun",
    "shangyong":"zhang_lu","hanzhong":"zhang_lu","yangping":"zhang_lu",
    "commandery_city_105":"neutral","commandery_city_100":"sun","cangwu":"sun"
  },
  // 刘备新得汉中、东三郡，关羽北围樊城；湘水划界后长沙、桂阳、江夏归吴；交州诸郡附吴，士燮仍自领交趾。
  "219_xiangyang":{
    "xiangyang":"cao","xian_extra_05":"cao","xinye":"cao","wan":"cao","yiling":"liu",
    "xiakou":"sun","xian_extra_14":"sun","xian_extra_15":"sun","pukou":"sun","hefei":"cao","shouchun":"cao",
    "commandery_city_105":"neutral","commandery_city_100":"sun","cangwu":"sun"
  }
};

const SCENARIOS=[{id:"200_guandu",index:0},{id:"190_coalition",index:1},{id:"208_red_cliffs",index:2},{id:"194_puyang",index:3},{id:"211_tongguan",index:4},{id:"219_xiangyang",index:5}];
if(scenarioId&&!SCENARIOS.some(scenario=>scenario.id===scenarioId))throw new Error(`未知剧本：${scenarioId}`);
const citiesFile=read("game/data/history/cities/200_guandu.json");
const defined=new Set(citiesFile.cities.map(city=>city.commandery));
const missing=[...defined].filter(name=>name!=="塞外区域"&&!COMMANDERY_OWNERS[name]);
if(missing.length)throw new Error(`缺少郡国归属定义：${missing.join("、")}`);
const unknown=[...Object.keys(COMMANDERY_OWNERS)].filter(name=>!defined.has(name));
if(unknown.length)throw new Error(`归属表含未知郡国：${unknown.join("、")}`);

function ownersFor(scenario){
  const overrides=CITY_OWNERS[scenario.id]||{},owners={};
  for(const city of citiesFile.cities){
    const value=overrides[city.id]||COMMANDERY_OWNERS[city.commandery]?.[scenario.index];
    if(!value)throw new Error(`据点缺少归属：${city.id} ${city.name} (${city.commandery}) @${scenario.id}`);
    owners[city.id]=value;
  }
  const extra=Object.keys(overrides).filter(id=>!citiesFile.cities.some(city=>city.id===id));
  if(extra.length)throw new Error(`${scenario.id} 覆盖表含未知据点：${extra.join("、")}`);
  return owners;
}

function replaceInlineObject(text,key,value){
  const marker=`"${key}":`;
  const start=text.indexOf(marker);
  if(start<0)throw new Error(`未找到 ${key}`);
  let index=start+marker.length;while(/\s/.test(text[index]))index++;
  if(text[index]!=="{")throw new Error(`${key} 不是内联对象`);
  let depth=0,end=index,inString=false,escaped=false;
  for(;end<text.length;end++){
    const char=text[end];
    if(inString){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char==='"')inString=false;continue}
    if(char==='"'){inString=true;continue}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0){end++;break}
  }
  return text.slice(0,index)+JSON.stringify(value)+text.slice(end);
}

// forces 条目的 "cities" 是各势力初始据点数，用于开局府库与占领计数；按归属派生后写回，避免沿用旧图遗留值。
function seatCounts(owners){
  const counts={};
  for(const city of citiesFile.cities)if((city.type||"city")==="city")counts[owners[city.id]]=(counts[owners[city.id]]||0)+1;
  return counts;
}
function syncForceCounts(text,counts){
  const missing=[];
  const out=text.replace(/\{\s*"id"\s*:\s*"([a-z_]+)"\s*,\s*"name"\s*:\s*"[^"]*"\s*,\s*"color"\s*:\s*"#[0-9a-fA-F]+"\s*,\s*"soldiers"\s*:\s*\d+\s*,\s*"cities"\s*:\s*\d+\s*\}/gu,(match,id)=>{
    if(!(id in counts)&&id!=="neutral")missing.push(id);
    return match.replace(/("cities"\s*:\s*)\d+(?=\s*\})/u,(_,prefix)=>prefix+(counts[id]||0));
  });
  return {out,missing};
}

const report=[];
for(const scenario of SCENARIOS){
  if(scenarioId&&scenario.id!==scenarioId)continue;
  const owners=ownersFor(scenario);
  const counts={};for(const value of Object.values(owners))counts[value]=(counts[value]||0)+1;
  report.push({scenario:scenario.id,total:Object.keys(owners).length,forces:Object.keys(counts).length,counts});
  if(!write)continue;
  if(scenario.id==="200_guandu"){
    const data=read("game/data/history/cities/200_guandu.json");
    for(const city of data.cities)city.force=owners[city.id];
    fs.writeFileSync(path.join(root,"game/data/history/cities/200_guandu.json"),JSON.stringify(data,null,2)+"\n");
    const forcesPath="game/data/history/forces/200_guandu.json";
    const forcesText=fs.readFileSync(path.join(root,forcesPath),"utf8");
    const synced=syncForceCounts(forcesText,seatCounts(owners));
    if(synced.missing.length)throw new Error(`200_guandu 势力缺少据点计数：${synced.missing.join("、")}`);
    fs.writeFileSync(path.join(root,forcesPath),synced.out);
  }else{
    const relative=`game/data/history/scenarios/${scenario.id}.json`;
    let text=fs.readFileSync(path.join(root,relative),"utf8");
    const planned={};
    for(const city of citiesFile.cities)planned[city.id]=owners[city.id];
    const sorted=Object.fromEntries(Object.keys(planned).sort().map(id=>[id,planned[id]]));
    text=replaceInlineObject(text,"city_forces",sorted);
    const synced=syncForceCounts(text,seatCounts(owners));
    if(synced.missing.length)throw new Error(`${scenario.id} 势力缺少据点计数：${synced.missing.join("、")}`);
    fs.writeFileSync(path.join(root,relative),synced.out);
  }
}
console.log(JSON.stringify(report,null,1));
console.log(write?"已写入归属":"（演练模式，加 --write 才写入）");
