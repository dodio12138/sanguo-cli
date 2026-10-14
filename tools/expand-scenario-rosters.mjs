// 各剧本登场人物考据补录。只写人物名册：200 官渡写 officers/200_guandu.json，其余剧本写 patch.officer_assignments / extra_officers；
// 不触碰地图、城池归属与军团。可重复运行（幂等）；--check 只校验不写入。
import fs from "node:fs";

const check=process.argv.includes("--check");
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),"utf8"));
// 保留原文件排版：只替换 patch 中的 extra_officers / officer_assignments 两段，其余原样保留。
// 手排剧本（如 190）逐项一行；两格缩进的剧本按该段原缩进展开。
const line=item=>JSON.stringify(item);
function valueSpan(text,key){const at=text.indexOf(`${line(key)}:`);if(at<0)throw new Error(`找不到 ${key}`);let index=text.indexOf(":",at)+1;while(/\s/.test(text[index]))index++;const start=index;let depth=0,inString=false;for(;index<text.length;index++){const char=text[index];if(inString){if(char==="\\")index++;else if(char==="\"")inString=false;continue}if(char==="\"")inString=true;else if(char==="["||char==="{")depth++;else if(char==="]"||char==="}"){depth--;if(!depth)return [start,index+1]}}throw new Error(`${key} 未闭合`)}
function spliceValue(text,key,value){const [start,end]=valueSpan(text,key),original=text.slice(start,end),indent=text.slice(text.lastIndexOf("\n",start)+1).match(/^ */)[0];let next;
  if(/\n {6}"[^"]+":\{/.test(original)||/\n {6}[\[{"]/.test(original)&&!/\n {8}/.test(original)){const items=Array.isArray(value)?value.map(entry=>`${indent}  ${line(entry)}`):Object.entries(value).map(([name,entry])=>`${indent}  ${line(name)}:${line(entry)}`);next=`${original[0]}\n${items.join(",\n")}\n${indent}${original.at(-1)}`}
  else next=JSON.stringify(value,null,2).split("\n").map((row,index)=>index?indent+row:row).join("\n");
  return text.slice(0,start)+next+text.slice(end)}
const write=(path,value)=>{const url=new URL(path,import.meta.url);if(!value.patch){fs.writeFileSync(url,`${JSON.stringify(value,null,2)}\n`);return}let text=fs.readFileSync(url,"utf8");text=spliceValue(text,"extra_officers",value.patch.extra_officers);text=spliceValue(text,"officer_assignments",value.patch.officer_assignments);if(line(JSON.parse(text))!==line(value))throw new Error(`${path} 排版写回与数据不一致`);fs.writeFileSync(url,text)};
const apt=code=>Object.fromEntries(["spear","halberd","crossbow","cavalry","siege","navy"].map((key,index)=>[key,code[index]||"C"]));

// 参考库与已有名册均未收录的人物（正史与演义合收）。能力为游戏估值（statsBasis: game-estimate），生卒不详者取史事上下限估计。
// [id, 姓名, 生, 卒, 籍贯/出仕地城池id, 统, 武, 智, 政, 魅, 适性(枪戟弩骑兵水)]
const NEW_PEOPLE=[
  ["history_sun_ben","孙贲",160,210,"yuzhang",64,62,55,58,62,"BCCBCB"],
  ["history_sun_fu","孙辅",170,210,"yuzhang",58,56,50,52,52,"CCCCCB"],
  ["history_sun_he","孙河",160,204,"wu",60,64,48,46,60,"BCCCCB"],
  ["history_shi_huan","史涣",158,209,"qiao",66,62,48,40,58,"BCCBCC"],
  ["history_ren_jun","任峻",155,204,"xuchang",58,42,70,86,76,"CCCCCC"],
  ["history_zao_zhi","枣祗",155,198,"xuchang",46,32,74,84,68,"CCCCCC"],
  ["history_duan_wei","段煨",145,209,"hongnong",72,68,62,72,74,"CCCBCC"],
  ["history_wei_kang","韦康",172,213,"tianshui",50,30,67,78,77,"CCCCCC"],
  ["history_xianyu_fu","鲜于辅",158,225,"commandery_city_092",64,56,60,62,64,"CCCBCC"],
  ["history_xianyu_yin","鲜于银",158,205,"commandery_city_092",58,62,40,36,46,"CCCBCC"],
  ["history_qi_zhou","齐周",155,200,"commandery_city_092",40,30,62,64,56,"CCCCCC"],
  ["history_geng_wu","耿武",150,191,"ye",46,50,56,60,62,"CCCCCC"],
  ["history_min_chun","闵纯",152,191,"ye",40,34,64,66,60,"CCCCCC"],
  ["history_zhao_fu","赵浮",150,200,"ye",62,58,50,42,50,"CCBCCB"],
  ["history_cheng_huan","程奂",150,200,"ye",58,62,40,36,46,"CCBCCC"],
  ["history_yang_ding","杨定",148,197,"changan",64,66,40,30,44,"CBCBCC"],
  ["history_li_meng","李蒙",150,192,"changan",58,64,30,24,34,"CBCBCC"],
  ["history_wang_fang","王方",152,192,"changan",56,63,28,22,30,"CBCBCC"],
  ["history_cai_yong","蔡邕",133,192,"luoyang",10,6,82,72,86,"CCCCCC"],
  ["history_yang_biao","杨彪",142,225,"luoyang",22,12,74,80,78,"CCCCCC"],
  ["history_zhao_yu","赵昱",152,194,"xiapi",40,26,72,76,80,"CCCCCC"],
  ["history_shi_yi_beihai","是仪",162,243,"beihai",30,20,70,78,72,"CCCCCC"],
  ["history_zhao_wei","赵韪",150,201,"chengdu",62,52,62,64,60,"CCCCCC"],
  ["history_jia_long","贾龙",150,191,"chengdu",60,58,50,52,56,"BCCCCC"],
  ["history_zhang_su","张肃",165,225,"commandery_city_057",40,30,60,66,68,"CCCCCC"],
  ["history_zhang_yi_junsi","张裔",166,230,"chengdu",52,40,70,78,62,"CCCCCC"],
  ["history_liu_yi_liaodong","柳毅",158,215,"xiangping",60,58,54,52,50,"CCCBCC"],
  ["history_yang_yi_liaodong","阳仪",160,238,"xiangping",58,56,58,56,48,"CCCBCC"],
  ["history_shi_yi_jiaozhi","士壹",142,220,"commandery_city_102",50,40,62,70,66,"CCCCCB"],
  ["history_shi_wei","士䵋",145,224,"commandery_city_104",48,40,58,64,60,"CCCCCB"],
  ["history_shi_wu","士武",147,205,"panyu",52,48,50,58,56,"CCCCCB"],
  ["history_jiang_xu","姜叙",170,225,"tianshui",64,62,60,52,64,"CCCBCC"],
  ["history_zhao_ang","赵昂",170,225,"tianshui",58,52,64,62,58,"CCBCCC"],
  ["history_wei_ji","卫觊",160,229,"commandery_city_003",30,20,74,82,62,"CCCCCC"],
  ["history_liu_yan_weishuo","刘琰",165,234,"xiaopei",40,34,52,56,74,"CCCCCC"],
  ["history_chang_xi","昌豨",160,206,"commandery_city_031",60,66,40,30,50,"BCCCCC"],
  ["history_wu_dun","吴敦",162,220,"langya",56,60,36,30,46,"BCCCCC"],
  ["history_yin_li","尹礼",162,220,"langya",56,60,36,30,46,"BCCCCC"],
  ["history_du_xi","杜袭",170,235,"commandery_city_008",44,30,72,78,64,"CCCCCC"],
  ["history_zhao_yan","赵俨",171,245,"commandery_city_008",60,40,72,80,66,"CCCCCC"],
  ["history_he_qia","和洽",167,235,"xiangyang",26,16,70,76,64,"CCCCCC"],
  ["history_zhang_xiu_hanzhong","张修",150,191,"hanzhong",52,48,58,50,64,"CCCCCC"],
  // 演义人物
  ["history_kong_xiu","孔秀",165,200,"luoyang",52,60,30,28,36,"BCCBCC"],
  ["history_han_fu_luoyang","韩福",160,200,"luoyang",55,58,40,42,40,"CCBCCC"],
  ["history_meng_tan","孟坦",165,200,"luoyang",50,62,28,24,32,"BCCCCC"],
  ["history_qin_qi","秦琪",170,200,"baima",54,64,30,24,34,"BCCBCB"],
  ["history_wang_zhi","王植",160,200,"commandery_city_008",50,46,52,48,40,"CCBCCC"],
  ["history_cai_yang","蔡阳",150,200,"xuchang",62,70,32,28,38,"BCCBCC"],
  ["history_yang_ling","杨龄",170,208,"changsha",52,64,30,26,38,"BCCCCC"],
  ["history_chunyu_dao","淳于导",170,208,"xiangyang",56,66,30,22,34,"BCCBCC"]
].map(([id,name,birthYear,deathYear,home,command,war,intelligence,politics,charm,code])=>({id,name,birthYear,deathYear,debutYear:Math.max(184,birthYear+18),home,command,war,intelligence,politics,charm,aptitude:apt(code),statsBasis:"game-estimate"}));

// 每行「势力@城: 人物…」，城可写名称或id；人物后缀 =忠诚（默认80）、!改属（覆盖已有指派）、~卒年（无=null，卒年校正）。
const ROSTERS={
  "190_coalition":`
dong@洛阳: 李傕 郭汜 牛辅 董旻 李肃 贾诩 段煨 胡轸 杨定 蔡邕=60 杨彪=35 王允=40
dong@孟津: 徐荣 张辽 高顺 郝萌 曹性 宋宪 魏续 侯成
dong@长安: 张济 樊稠 李蒙 王方
dong@槐里: 皇甫嵩=45
cao@谯: 曹纯 乐进 任峻 枣祗 史涣
han_fu@邺: 沮授! 审配! 田丰! 张郃 麴义 耿武=95 闵纯=95 赵浮 程奂
yuan@南皮: 逢纪 许攸 淳于琼 郭图 辛评 高干=95 荀谌
sun_jian@长沙: 朱治 祖茂 吴景=95 孙贲=95 桓阶
gongsun@北平: 关羽=95 张飞=95 简雍 田豫 关靖 严纲 单经 公孙越=100 公孙范=95
gongsun@土垠: 田楷 邹丹 王门
liu_yu@蓟: 鲜于辅 鲜于银 齐周 魏攸 刘和=100
wang_kuang@河内: 韩浩
tao_qian@郯县: 糜竺 王朗 赵昱 张闿 笮融=60
tao_qian@下邳: 陈珪 糜芳 孙乾
kong_rong@北海: 是仪 国渊
yuan_shu@宛: 张勋 桥蕤 袁胤=95 韩胤 雷薄 陈兰 李丰 乐就
liu_biao@襄阳: 伊籍 韩嵩 张允 王威
liu_yan@成都: 赵韪 贾龙=60 董和 张修
han_sui@金城: 阎行 成公英
gongsun_du@襄平: 柳毅 阳仪
shi_xie@交趾: 士壹=100 士䵋=100 士武=100
zhou_xin@宛陵: 周昂=95
dong@洛阳: 貂蝉=30
han_fu@邺: 潘凤
kong_rong@北海: 武安国
wang_kuang@河内: 方悦 张杨=60 穆顺
yuan_shu@宛: 俞涉
liu_yu@蓟: 邹靖
zhang_miao@陈留: 典韦
yuan@南皮: 刘氏=100
cao@谯: 卞氏=100
sun_jian@长沙: 吴国太=100
`,
  "194_puyang":`
cao@鄄城: 韩浩 史涣 王忠
zhang_yang@河内: 董昭=70
liu@小沛: 袁涣 刘琰
yuan_shu@寿春: 陈武 孙贲=90 孙河=90
liu_yao@建业: 笮融=55
liu_zhang@成都: 赵韪 吴兰 雷铜 张肃 张裔
liu_biao@襄阳: 甘宁 韩玄
yuan@邺: 麴义
wang_lang@kuaiji: 许靖=70
shi_xie@交趾: 士壹=100 士䵋=100 士武=100 程秉
gongsun_du@襄平: 柳毅 阳仪
li_jue@长安: 杨定 杨彪=40 金旋
lu_bu@濮阳: 貂蝉=100
li_jue@弘农: 邹氏=100
liu_biao@零陵: 邢道荣
ma_teng@天水: 马云禄=100
`,
  "200_guandu":`
cao@许昌: 韩浩 史涣 任峻 王忠 朱灵 袁涣 王朗 孔融=50 杜畿 国渊 刘岱 卫觊 杜袭 鲜于辅 田豫 孙观 吴敦 尹礼
cao@奉高: 吕虔
cao@汝南: 赵俨
cao@陈留: 胡车儿
cao@弘农: 段煨
yuan@邺: 蒋义渠 韩莒子 崔琰 李孚
yuan@南皮: 郭援 牵招 焦触 张南
yuan@蓟: 吕翔 王门 阎柔=70
liu@下邳: 陈到 刘琰
liu@郯县: 昌豨=55
liu_biao@襄阳: 王粲 伊籍 傅巽
liu_biao@长沙: 刘磐=95 黄忠
liu_biao@夏口: 苏飞 甘宁
liu_biao@夷陵: 李严
sun@吴: 朱治 孙静=95 孙河=95
sun@建业: 周泰 陈武 宋谦 吕范
sun@豫章: 孙贲=95 华歆=60
sun@庐江: 孙辅=60
sun@宛陵: 吴景=95 孙瑜=95
sun@kuaiji: 虞翻 董袭 顾雍
sun@建安: 贺齐
liu_zhang@成都: 张松 王累 刘璝 吴班 吴兰 雷铜 董和 张肃 孟达 赵韪=30 张裔
liu_zhang@梓潼: 杨怀 高沛
zhang_lu@汉中: 杨松 杨柏
zhang_lu@阳平关: 张卫=95~
ma_teng@槐里: 马休=100 马铁=100
han_sui@安定: 杨秋 程银 李堪
gongsun_du@襄平: 公孙恭=100 柳毅 阳仪
shi_xie@交趾: 士壹=100 程秉 许靖=70
shi_xie@合浦: 士䵋=100
shi_xie@番禺: 士武=100
wei_duan@天水: 韦康=100 杨阜 姜叙 赵昂
cao@许昌: 孔秀 蔡阳 夏侯恩 夏侯德 卞氏=100
cao@洛阳: 韩福 孟坦
cao@虎牢关: 卞喜 王植 胡班
cao@白马津: 秦琪
yuan@邺: 刘氏=100 甄氏=90 沮鹄
liu_biao@长沙: 韩玄
liu_biao@桂阳: 赵范 陈应 鲍隆 樊氏
liu_biao@武陵: 金旋 巩志
liu_biao@零陵: 刘度 邢道荣
sun@建业: 吴国太=100 大乔=100 小乔=100
wei_duan@天水: 王异
ma_teng@槐里: 马云禄=100
`,
  "208_red_cliffs":`
cao@襄阳: 曹纯 曹休 曹真 夏侯尚 刘晔 韩浩 张郃 蒋干 徐庶=60 杨修 王粲 蒯越 韩嵩 傅巽 和洽 娄圭 蔡瑁~ 张允=70
cao@江陵: 牛金
cao@许昌: 毛玠 陈群 华歆 王朗 董昭 桓阶 杜袭 卫觊
cao@邺: 曹丕=100 曹植=100 崔琰 司马懿 辛毗 王修 陈琳 国渊 马休=60 马铁=60
cao@长安: 钟繇 张既
cao@安邑: 杜畿
cao@晋阳: 梁习
cao@汝南: 李通 满宠 赵俨
cao@合肥: 刘馥 蒋济
cao@琅琊: 臧霸 孙观
cao@奉高: 吕虔
sun@柴桑: 周泰 陈武 蒋钦 徐盛 潘璋 宋谦 董袭 苏飞 孙瑜=95
sun@吴: 朱治 陆逊 朱然 孙韶=95
sun@建业: 张纮 步骘 严畯 是仪
sun@kuaiji: 虞翻 顾雍
sun@建安: 贺齐
liu@夏口: 刘封=95 关平=95 糜芳 陈到 伊籍 霍峻 刘琰
liu_zhang@成都: 王累 刘璝 吴班 吴兰 雷铜 董和 孟达 李严 刘循=100 张肃 张裔
liu_zhang@葭萌关: 杨怀 高沛
zhang_lu@汉中: 杨松 杨柏
zhang_lu@阳平关: 张卫=95~ 杨昂
han_sui@金城: 阎行
han_sui@安定: 杨秋 程银 李堪
wei_kang@天水: 姜叙 赵昂
gongsun_kang@襄平: 公孙恭=100 柳毅 阳仪
shi_xie@交趾: 士壹=100 程秉 许靖=70
shi_xie@合浦: 士䵋=100
cao@襄阳: 夏侯恩 夏侯德 蔡氏=70 蔡和 蔡中 王威 淳于导
cao@邺: 卞氏=100 甄氏=100 蔡琰 张春华
liu@夏口: 周仓=100 糜氏=100 黄月英=100
sun@建业: 吴国太=100 孙尚香=100 大乔=100 徐氏
sun@柴桑: 小乔=100 太史慈
liu_du@零陵: 刘贤=100 邢道荣
zhao_fan@桂阳: 陈应 鲍隆 樊氏
jin_xuan@武陵: 巩志
han_xuan@长沙: 杨龄
wei_kang@天水: 王异
ma_chao@槐里: 马云禄=100
`,
  "211_tongguan":`
cao@邺: 徐庶=60 蒯越 桓阶 袁涣 和洽 卫觊 杜袭 赵俨
liu_zhang@成都: 邓芝 费诗 秦宓 张肃 张裔
liu@公安: 冯习 傅彤 刘琰
cao@天水: 姜叙 赵昂
gongsun_kang@襄平: 柳毅 阳仪
shi_xie@交趾: 士壹=100 士䵋=100
cao@汝南: 李通
cao@许昌: 金祎=50
cao@邺: 娄圭 刘勋 蔡琰 张春华
cao@弘农: 韩德
cao@天水: 王异
liu@公安: 孙尚香=60 黄月英=100
liu@江陵: 周仓=100 胡班
liu@桂阳: 赵范 樊氏
sun@建业: 吴国太=100 大乔=100~ 小乔=100~ 徐氏
ma_chao@潼关: 马云禄=100
`,
  "219_xiangyang":`
cao@邺: 阎圃 徐庶=60 陈矫 和洽 卫觊 杜袭 阎行 成公英
cao@长安: 杨秋 侯选
cao@汝南: 赵俨
cao@天水: 姜叙 赵昂
liu@江州: 严颜
liu@公安: 刘璋=60 刘琰
liu@成都: 张裔 张肃
sun@吴: 朱治 是仪
gongsun_kang@襄平: 阳仪
shi_xie@交趾: 士壹=100 士䵋=100
cao@邺: 张鲁=70 蔡琰 张春华 辛宪英
cao@长安: 韩德
cao@天水: 王异
cao@寿春: 蒋干
liu@成都: 黄月英=100 马云禄=100 张苞=100 孙乾
liu@宜城: 周仓=100 胡班 关索=100 鲍三娘
sun@建业: 孙尚香=90 大乔=100~ 小乔=100~ 徐氏
sun@濡须口: 凌统
sun@夏口: 苏飞
`
};

const reference=read("../game/data/reference/officers-san11.json").officers,baseFile="../game/data/history/officers/200_guandu.json",base=read(baseFile),cities=read("../game/data/history/cities/200_guandu.json").cities;
const cityName=Object.fromEntries(cities.map(city=>[city.id,city.name])),newByName=new Map(NEW_PEOPLE.map(person=>[person.name,person]));
const errors=[],summary=[],pending=[];
function parse(text){const rows=[];for(const line of text.trim().split("\n")){const [head,names]=line.split(":");const [force,city]=head.trim().split("@");for(const token of names.trim().split(/\s+/)){const match=token.match(/^([^=!~]+)(?:=(\d+))?(!)?(~(\d+)?)?$/u);if(!match){errors.push(`无法解析：${token}`);continue}rows.push({force,city,name:match[1],loyalty:match[2]?Number(match[2]):80,override:Boolean(match[3]),deathFix:match[4]?(match[5]?Number(match[5]):null):undefined})}}return rows}
function resolveCity(owners,force,city,scenario){const owned=Object.entries(owners).filter(([,owner])=>owner===force).map(([id])=>id);if(owned.includes(city))return city;const byName=owned.filter(id=>cityName[id]===city);if(byName.length===1)return byName[0];errors.push(`${scenario}：${force} 不领有「${city}」${byName.length>1?"（重名）":""}`);return null}
const recordFor=(person,extra={})=>{const {home,...record}=person;return {...record,...extra}};

for(const [scenarioId,text] of Object.entries(ROSTERS)){
  const year=Number(scenarioId.slice(0,3)),rows=parse(text);
  if(scenarioId==="200_guandu"){
    const owners=Object.fromEntries(cities.map(city=>[city.id,city.force]));let added=0;
    for(const row of rows){const city=resolveCity(owners,row.force,row.city,scenarioId);if(!city)continue;let officer=base.officers.find(item=>item.name===row.name);
      if(!officer){const person=newByName.get(row.name)||reference.find(item=>item.name===row.name);if(!person){errors.push(`${scenarioId}：查无此人 ${row.name}`);continue}officer={...recordFor(person),merit:0,office:"无",officeRank:0,stamina:100,experience:0,skills:person.skills||(person.skill?[person.skill]:[])};base.officers.push(officer)}
      if(row.deathFix!==undefined){if(row.deathFix)officer.deathYear=row.deathFix;else delete officer.deathYear}
      if(officer.deathYear&&officer.deathYear<year)errors.push(`${scenarioId}：${row.name} 已于 ${officer.deathYear} 年去世`);
      if(officer.status==="serving"&&officer.force!==row.force&&!row.override){errors.push(`${scenarioId}：${row.name} 已仕 ${officer.force}`);continue}
      if(officer.status!=="serving"||officer.force!==row.force||officer.city!==city)added++;
      Object.assign(officer,{force:row.force,city,status:"serving",loyalty:row.loyalty})}
    // 200 年仍在世的新录人物写入基础名册（未指派者为在野），供其余剧本共用同一记录。
    for(const person of NEW_PEOPLE){if(base.officers.some(item=>item.name===person.name)||person.deathYear<year)continue;base.officers.push({...recordFor(person),force:"neutral",city:person.home,status:person.debutYear>year?"not_appeared":"hidden",loyalty:0,merit:0,office:"无",officeRank:0,stamina:100,experience:0,skills:[]})}
    summary.push(`${scenarioId}：新增/调整在任 ${added} 人，在任共 ${base.officers.filter(item=>item.status==="serving").length} 人`);continue;
  }
  const file=`../game/data/history/scenarios/${scenarioId}.json`,scenario=read(file),patch=scenario.patch,assignments=patch.officer_assignments,extras=patch.extra_officers,known=new Set([...reference,...base.officers].map(item=>item.name));
  for(const extra of extras)if(extra&&typeof extra==="object")known.add(extra.name);let added=0;
  for(const row of rows){const city=resolveCity(patch.city_forces,row.force,row.city,scenarioId);if(!city)continue;
    const person=newByName.get(row.name);
    if(!known.has(row.name)){if(!person){errors.push(`${scenarioId}：查无此人 ${row.name}`);continue}extras.push(recordFor(person));known.add(row.name)}
    const source=person||reference.find(item=>item.name===row.name)||base.officers.find(item=>item.name===row.name)||extras.find(item=>item?.name===row.name),death=row.deathFix!==undefined?row.deathFix:source?.deathYear;
    if(death&&death<year)errors.push(`${scenarioId}：${row.name} 已于 ${death} 年去世`);
    const prior=assignments[row.name];if(prior&&prior.force!==row.force&&!row.override){errors.push(`${scenarioId}：${row.name} 已仕 ${prior.force}`);continue}
    if(!prior||prior.force!==row.force||prior.city!==city)added++;
    const entry={force:row.force,city,loyalty:row.loyalty};if(row.deathFix!==undefined)entry.deathYear=row.deathFix;assignments[row.name]=entry}
  summary.push(`${scenarioId}：新增/调整 ${added} 人，在任共 ${Object.keys(assignments).length} 人`);
  pending.push([file,scenario]);
}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
if(!check){for(const [file,scenario] of pending)write(file,scenario);write(baseFile,base)}
console.log(summary.join("\n"));
