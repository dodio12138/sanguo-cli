window.SANGUO_DATA = (() => {
  const terrainDefs = {
    plains:{name:"平原",color:"#68724e",move:1},forest:{name:"林地",color:"#3f5942",move:2},
    hills:{name:"丘陵",color:"#6c664a",move:2},mountain:{name:"山地",color:"#4d5044",move:3},
    river:{name:"河流（线状）",color:"#4e9dc2",move:2},marsh:{name:"泽地",color:"#526359",move:3},
    desert:{name:"荒漠",color:"#927f55",move:2},grassland:{name:"草原",color:"#71805a",move:1},
    plateau:{name:"高原",color:"#706b52",move:2},basin:{name:"盆地",color:"#586f48",move:1},
    ocean:{name:"海洋",color:"#263f49",move:99}
  };
  const forces = [
    {id:"cao",name:"曹操",color:"#b89044",soldiers:86000,cities:5},
    {id:"yuan",name:"袁绍",color:"#776aa0",soldiers:121000,cities:7},
    {id:"liu",name:"刘备",color:"#637fa5",soldiers:24000,cities:2},
    {id:"sun",name:"孙策",color:"#a35448",soldiers:58000,cities:4},
    {id:"liu_biao",name:"刘表",color:"#55806a",soldiers:51000,cities:4},
    {id:"neutral",name:"无主",color:"#777568",soldiers:0,cities:0}
  ];
  const cities = [
    {id:"xuchang",name:"许昌",x:15,y:11,force:"cao",province:"豫州",population:184000,garrison:18000,governor:"荀彧",level:4},
    {id:"chenliu",name:"陈留",x:16,y:9,force:"cao",province:"兖州",population:126000,garrison:12000,governor:"程昱",level:3},
    {id:"luoyang",name:"洛阳",x:13,y:10,force:"cao",province:"司隶",population:91000,garrison:9000,governor:"夏侯惇",level:4},
    {id:"ye",name:"邺",x:16,y:7,force:"yuan",province:"冀州",population:211000,garrison:26000,governor:"审配",level:5},
    {id:"beiping",name:"北平",x:19,y:5,force:"yuan",province:"幽州",population:87000,garrison:10000,governor:"田豫",level:3},
    {id:"baima",name:"白马津",type:"ford",x:18,y:8,force:"cao",province:"兖州",population:6000,garrison:2500,governor:"刘延",level:1},
    {id:"guandu",name:"官渡",type:"pass",x:15,y:10,force:"neutral",province:"豫州",population:22000,garrison:1000,governor:"—",level:1},
    {id:"mengjin",name:"孟津",type:"ford",x:13,y:9,force:"cao",province:"司隶",population:5000,garrison:1800,governor:"—",level:1},
    {id:"xiapi",name:"下邳",x:19,y:10,force:"liu",province:"徐州",population:108000,garrison:9000,governor:"关羽",level:3},
    {id:"xinye",name:"新野",x:14,y:14,force:"liu_biao",province:"荆州",population:73000,garrison:8000,governor:"文聘",level:2},
    {id:"xiangyang",name:"襄阳",x:13,y:15,force:"liu_biao",province:"荆州",population:198000,garrison:19000,governor:"蔡瑁",level:5},
    {id:"xiakou",name:"夏口",type:"port",x:16,y:16,force:"liu_biao",province:"荆州",population:28000,garrison:5000,governor:"黄祖",level:2},
    {id:"jianye",name:"建业",x:20,y:14,force:"sun",province:"扬州",population:164000,garrison:15000,governor:"张昭",level:4},
    {id:"shouchun",name:"寿春",x:18,y:13,force:"sun",province:"扬州",population:119000,garrison:11000,governor:"周瑜",level:3}
  ];
  const provinces=["凉州","并州","幽州","冀州","兖州","司隶","豫州","徐州","荆州","扬州","益州"];
  const officers=[
    {id:"cao_cao",name:"曹操",force:"cao",city:"xuchang",command:96,war:91,intelligence:94,politics:96,loyalty:100,merit:1200,office:"司空",officeRank:5,status:"serving"},
    {id:"xun_yu",name:"荀彧",force:"cao",city:"xuchang",command:62,war:49,intelligence:95,politics:98,loyalty:94,merit:680,office:"尚书令",officeRank:3,status:"serving"},
    {id:"xiahou_dun",name:"夏侯惇",force:"cao",city:"luoyang",command:88,war:90,intelligence:61,politics:70,loyalty:100,merit:740,office:"将军",officeRank:3,status:"serving"},
    {id:"yuan_shao",name:"袁绍",force:"yuan",city:"ye",command:83,war:69,intelligence:70,politics:78,loyalty:100,merit:1000,office:"大将军",officeRank:5,status:"serving"},
    {id:"liu_bei",name:"刘备",force:"liu",city:"xiapi",command:82,war:78,intelligence:76,politics:84,loyalty:100,merit:760,office:"左将军",officeRank:4,status:"serving"},
    {id:"sun_ce",name:"孙策",force:"sun",city:"jianye",command:91,war:94,intelligence:72,politics:70,loyalty:100,merit:830,office:"讨逆将军",officeRank:4,status:"serving"},
    {id:"sima_yi",name:"司马懿",force:"neutral",city:"luoyang",command:97,war:63,intelligence:96,politics:93,loyalty:55,merit:0,office:"无",officeRank:0,status:"hidden"},
    {id:"xu_shu",name:"徐庶",force:"neutral",city:"xinye",command:74,war:66,intelligence:94,politics:80,loyalty:60,merit:0,office:"无",officeRank:0,status:"hidden"},
    {id:"pang_tong",name:"庞统",force:"neutral",city:"xiangyang",command:78,war:52,intelligence:97,politics:86,loyalty:58,merit:0,office:"无",officeRank:0,status:"hidden"}
  ];
  const items=[{id:"yitian_sword",name:"倚天剑",owner:"cao_cao",type:"weapon",bonus:{war:3}},{id:"qinggang_sword",name:"青釭剑",owner:null,type:"weapon",bonus:{war:3}},{id:"mengde_book",name:"孟德新书",owner:"cao_cao",type:"book",bonus:{intelligence:2}}];
  const armies=[
    {id:"cao_central",name:"中军",force:"cao",city:"xuchang",commander:"曹操",soldiers:18000,units:{infantry:10000,cavalry:5000,archers:3000},morale:88,training:78},
    {id:"cao_west",name:"虎豹营",force:"cao",city:"luoyang",commander:"夏侯惇",soldiers:9000,units:{infantry:3000,cavalry:5000,archers:1000},morale:82,training:84},
    {id:"yuan_vanguard",name:"河北先锋",force:"yuan",city:"ye",commander:"颜良",soldiers:24000,units:{infantry:15000,cavalry:7000,archers:2000},morale:79,training:72},
    {id:"liu_left",name:"左将军本队",force:"liu",city:"xiapi",commander:"刘备",soldiers:8000,units:{infantry:5500,cavalry:1000,archers:1500},morale:91,training:76},
    {id:"sun_jiangdong",name:"江东军",force:"sun",city:"jianye",commander:"孙策",soldiers:13000,units:{infantry:7000,cavalry:2500,archers:3500},morale:90,training:82},
    {id:"liu_biao_jingzhou",name:"荆州军",force:"liu_biao",city:"xiangyang",commander:"文聘",soldiers:12000,units:{infantry:7500,cavalry:1500,archers:3000},morale:78,training:74}
  ];
  cities.forEach(city=>Object.assign(city,{commerce:city.level*15,agriculture:city.level*14,order:70}));
  const rules={calendar:{days_per_turn:10,turns_per_month:3,months_per_year:12},orders:{max_player_orders_per_turn:8},resolution_phases:["domestic","diplomacy","movement","battle","supply","events"],movement:{road_cost:8,river_crossing_cost:5,forced_march_multiplier:1.6,rest_recovery:6,camp_recovery:18,isolated_cost:12},edge_modifiers:{"baima:ye":"river","baima:chenliu":"river","mengjin:guandu":"river","shouchun:xiakou":"river","jianye:shouchun":"river"},city_graph:{beiping:["ye"],ye:["beiping","baima"],baima:["ye","chenliu"],chenliu:["baima","guandu"],guandu:["chenliu","xuchang","mengjin"],mengjin:["guandu","luoyang"],luoyang:["mengjin"],xuchang:["guandu","xinye","xiapi"],xiapi:["xuchang","shouchun"],xinye:["xuchang","xiangyang"],xiangyang:["xinye","xiakou"],xiakou:["xiangyang","shouchun"],shouchun:["xiakou","xiapi","jianye"],jianye:["shouchun"]}};
  const events=[
    {id:"good_harvest",name:"五谷丰登",weight:3,effect:{food:900},text:"时雨应节，郡县秋粮增收。"},
    {id:"market_boom",name:"商旅云集",weight:2,effect:{gold:600},text:"道路渐安，四方商旅汇集。"},
    {id:"locusts",name:"蝗灾",weight:1,effect:{food:-700},text:"数县飞蝗蔽日，仓粮受损。"},
    {id:"refugees",name:"流民来归",weight:2,effect:{city:{population:1500,order:-2}},text:"邻境流民扶老携幼前来归附。"},
    {id:"flood",name:"水患",weight:1,effect:{food:-400,city:{order:-3}},text:"连日大雨，沿河郡县受灾。"},
    {id:"bandits",name:"盗贼蜂起",weight:1,effect:{gold:-200,city:{order:-5}},text:"地方盗贼聚众，商路一时不靖。"},
    {id:"quiet",name:"境内无事",weight:4,effect:{},text:"本旬境内无大事。"}
  ];
  const unitTypes={infantry:{name:"步兵",attack:1,defence:1,supply:1},cavalry:{name:"骑兵",attack:1.35,defence:.9,supply:1.5},archers:{name:"弓兵",attack:1.15,defence:.8,supply:1.1}};
  return {version:"0.7.0",map:{width:40,height:32,seed:200,id:"china_40x32"},terrainDefs,unitTypes,forces,cities,officers,items,armies,rules,events,commandCatalog:window.SANGUO_COMMAND_CATALOG,provinces};
})();
