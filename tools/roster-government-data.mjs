import {literatureOfficeDefinitions,literatureCourtAppointments,literatureExtraPosts} from "./roster-literature-government.mjs";
// 本批人物所需的汉庭任命与幕府配置。汉官、诸侯自署与势力内部职司分开记录。
// 未详者只做低阶官属或幕府分工近似，不为凑满九卿凭空授予高官。
export const officeDefinitions = [
  {id:"shangshupushe",name:"尚书仆射",branch:"central",parent:"shangshuling",rank:"六百石",grade:5,quota:1,legitimacy:6,duty:"尚书台副长，协助出纳诏命"},
  {id:"shangshu",name:"尚书",branch:"central",parent:"shangshuling",rank:"六百石",grade:5,quota:6,legitimacy:4,duty:"分曹处理尚书台政务"},
  {id:"shizhong",name:"侍中",branch:"central",parent:"emperor",rank:"比二千石",grade:5,quota:6,legitimacy:4,duty:"近侍顾问；黄门侍郎以职名变体表示"},
  {id:"shangshulang",name:"尚书郎",branch:"central",parent:"shangshuling",rank:"四百石",grade:6,quota:36,legitimacy:2,duty:"尚书台文书、议奏属官"},
  {id:"taiyiling",name:"太医令",branch:"central",parent:"shaofu",rank:"六百石",grade:6,quota:1,legitimacy:2,duty:"少府属官，掌宫廷医药"},
];

// [官职, 人物, 州郡/空, 变体/空, 自署, 来源键, 依据]
export const courtAppointments = {
190:[
  ["sikong","荀爽",null,null,false,"court","初平元年荀爽任司空，保留当年身故前的开局快照。"],
  ["shangshu","郑泰",null,null,false,"dong","董卓秉政时为尚书；属于汉廷职务，不是董卓私设长史。"],
  ["shangshupushe","士孙瑞",null,null,false,"dong","士孙瑞任尚书仆射，具体任年按初平京畿政局近似。"],
  ["dahonglu","韩融",null,null,false,"dong","初平年间大鸿胪，曾奉命与关东诸军议和。"],
],
194:[
  ["situ","赵温",null,null,false,"dong","兴平元年赵温为司徒。"],
  ["shangshupushe","士孙瑞",null,null,false,"dong","献帝东归前的尚书仆射，未提前授其后追赠。"],
  ["dahonglu","韩融",null,null,false,"dong","献帝朝大鸿胪，关中朝廷使臣。"],
  ["shizhong","钟繇",null,"黄门侍郎",false,"staff","钟繇为黄门侍郎，参与说服李傕等使天子东归。"],
],
200:[
  ["situ","赵温",null,null,false,"dong","赵温仍为汉司徒，至建安十三年才免官。"],
  ["taiyiling","吉本",null,null,false,"cao","太医令的前期配置；确切就任年未详，按建安朝医官推定。"],
  ["shizhong","耿纪",null,null,false,"farming","耿纪侍中身份见杜畿传；开局具体任年近似。"],
  ["shangshulang","潘勖",null,null,false,"scholars","建安朝尚书郎、文士；此年就任时点为近似。"],
  ["zahao","伏完",null,"辅国将军",false,"dong","伏完为辅国将军，保留献帝朝廷身份。"],
],
208:[
  ["taiyiling","吉本",null,null,false,"cao","建安朝太医令；就任年未详，作为医官前期推定。"],
  ["shizhong","耿纪",null,null,false,"farming","耿纪为侍中，非魏王国官。"],
  ["shangshulang","潘勖",null,null,false,"scholars","汉廷尚书郎。"],
],
211:[
  ["taiyiling","吉本",null,null,false,"cao","建安朝太医令；不在 219 复活已于 218 遇害者。"],
  ["shaofu","耿纪",null,null,false,"cao","建安末少府，211 提前就任属推定。"],
  ["shangshulang","潘勖",null,null,false,"scholars","建安朝尚书郎。"],
],
219:[
  ["taishou","苏则","金城郡",null,false,"farming","汉中平后徙金城太守。"],
  ["taishou","毌丘兴","武威郡",null,false,"farming","建安末武威太守，确切就任年未详，219 为时点近似。"],
  ["taishou","杜通","张掖郡",null,false,"farming","黄初初见张掖太守，219 提前一年属推定。"],
  ["taishou","辛机","酒泉郡",null,false,"farming","黄初初见酒泉太守，219 提前一年属推定。"],
  ["taishou","习祯","广汉郡",null,true,"shuPeople","刘备入蜀后历广汉太守；此年任所近似，属于诸侯自署。"],
  ["taishou","费观","巴郡",null,true,"shuPeople","费观为巴郡太守、江州都督；任期与廖立交接未详，开局原表优先，本项作为候选记录不强行覆盖。"],
],
};

// 势力 @ 军师 / 长史 / 司马；- 表示保留原配置或空缺。三职是游戏幕府分工，不冒充同名史官。
export const centralAssignments = {
190:`
dong@- / 郑泰 / 徐荣
cao@戏志才 / 任峻 / 夏侯惇
yuan@荀谌 / 逢纪 / 淳于琼
sun_jian@桓阶 / 朱治 / 程普
gongsun@关靖 / 公孙范 / 严纲
han_fu@田丰 / 闵纯 / 沮授
liu_yu@魏攸 / 齐周 / 鲜于辅
tao_qian@陈珪 / 糜竺 / 曹豹
kong_rong@王修 / 是仪 / 武安国
liu_yan@董扶 / 董和 / 贾龙
yuan_shu@阎象 / 杨弘 / 张勋
ma_teng@- / - / 庞德
han_sui@成公英 / - / 阎行
gongsun_du@阳仪 / - / 柳毅
wang_kuang@韩浩 / - / -
zhang_miao@- / 卫兹 / -
zhang_chao@- / 臧洪 / -
liu_chong@- / 骆俊 / -
shi_xie@- / 士壹 / 士武
`,
194:`
cao@程昱 / 荀彧 / 夏侯惇
lu_bu@陈宫 / 许汜 / 张辽
tao_qian@陈珪 / 糜竺 / 曹豹
liu@袁涣 / 简雍 / 张飞
yuan@田丰 / 审配 / 沮授
gongsun@关靖 / 公孙范 / 邹丹
yuan_shu@阎象 / 杨弘 / 张勋
liu_biao@- / - / 蔡瑁
liu_zhang@黄权 / 董和 / 张任
zhang_lu@阎圃 / 杨松 / 张卫
li_jue@贾诩 / 钟繇 / 杨奉
ma_teng@- / - / 庞德
han_sui@成公英 / - / 阎行
gongsun_du@阳仪 / - / 柳毅
wang_lang@虞翻 / 许靖 / 周昕
zhang_yang@董昭 / 司马朗 / 眭固
liu_chong@- / 骆俊 / -
shi_xie@- / 程秉 / 士壹
`,
200:`
cao@- / - / 韩浩
yuan@- / - / 淳于琼
liu@孙乾 / 糜竺 / 张飞
sun@周瑜 / - / 程普
liu_biao@- / - / 蔡瑁
liu_zhang@张松 / 董和 / 张任
zhang_lu@阎圃 / 杨松 / 张卫
ma_teng@- / - / 庞德
han_sui@成公英 / - / 阎行
gongsun_du@阳仪 / - / 柳毅
shi_xie@- / 程秉 / 士壹
wei_duan@杨阜 / - / 姜叙
`,
208:`
cao@- / - / 韩浩
liu@诸葛亮 / 糜竺 / 张飞
sun@鲁肃 / - / 周瑜
liu_zhang@张松 / 董和 / 张任
zhang_lu@阎圃 / 杨松 / 张卫
gongsun_kang@阳仪 / - / 柳毅
han_xuan@- / - / 黄忠
liu_du@- / 刘贤 / 邢道荣
zhao_fan@- / - / 陈应
jin_xuan@- / 巩志 / -
ma_chao@- / - / 庞德
han_sui@成公英 / - / 阎行
wei_kang@杨阜 / - / 姜叙
shi_xie@- / 程秉 / 士壹
`,
211:`
cao@- / - / 韩浩
ma_chao@- / - / 庞德
han_sui@成公英 / - / 阎行
liu@- / 诸葛亮 / 关羽
sun@鲁肃 / - / 吕蒙
liu_zhang@黄权 / 董和 / 张任
zhang_lu@阎圃 / 杨松 / 张卫
shi_xie@- / 程秉 / 士壹
gongsun_kang@阳仪 / - / 柳毅
`,
219:`
cao@- / - / 曹仁
liu@- / - / 张飞
sun@陆逊 / - / 吕蒙
shi_xie@- / 程秉 / 士壹
gongsun_kang@阳仪 / - / 卑衍
`,
};

export const extraPosts = {
200:[{force:"liu_zhang",holder:"王连",kind:"jun",commanderies:["梓潼郡"],title:"梓潼留守（推定）",basis:"史为梓潼令；按本地驻防映射为游戏郡级留守，不宣称史任梓潼太守。",source:"shuLocal"}],
208:[{force:"liu_zhang",holder:"王连",kind:"jun",commanderies:["梓潼郡"],title:"梓潼留守（推定）",basis:"梓潼令闭城不降刘备的地方守备，按游戏郡级留守近似。",source:"shuLocal"}],
211:[{force:"liu_zhang",holder:"王连",kind:"jun",commanderies:["梓潼郡"],title:"梓潼留守（推定）",basis:"梓潼令闭城不降，游戏中以郡级留守表达。",source:"shuLocal"}],
};
officeDefinitions.push(...literatureOfficeDefinitions);
for(const year of [190,194,200,208,211,219]){
 courtAppointments[year].push(...literatureCourtAppointments[year]);
 extraPosts[year]=[...(extraPosts[year]||[]),...(literatureExtraPosts[year]||[])];
}
// 董卓长史有刘艾明确史载，替换上一轮按文职能力映射的郑泰。
centralAssignments[190]=centralAssignments[190].replace("dong@- / 郑泰 / 徐荣","dong@- / 刘艾 / 徐荣");
