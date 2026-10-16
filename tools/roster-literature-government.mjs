// 第二轮任命：汉廷、诸侯自署、魏国官保持区分；同席既任者仍由生成器保留。
export const literatureOfficeDefinitions=[
 {id:"zhijinwu",name:"执金吾",branch:"central",parent:"emperor",rank:"中二千石",grade:3,quota:1,legitimacy:8,duty:"掌宫外警戒、巡察京师"},
];
export const literatureCourtAppointments={
190:[
 ["guanglu","宣璠",null,null,false,"han72","董卓以宣璠为光禄勋，使持节拜太师；190开局为此前后近似。"],
 ["zhijinwu","胡母班",null,null,false,"sgz6","执金吾，奉诏出使关东，留190年遇害前快照。"],
 ["shizhong","王盖",null,null,false,"han66","王允长子为侍中；确切起任年未详，早期朝官近似。"],
 ["taiyiling","脂习",null,null,false,"sgz11","中平中至天子西迁、东归随从，为太医令，记其汉廷官职。"],
 ["taishou","任岐","犍为郡",null,false,"sgz31","犍为太守，191年与贾龙举兵被杀；不提前改写地图势力。"],
 ["taishou","苏固","汉中郡",null,false,"sgz8","张鲁、张修奉刘焉命进军前的汉中太守，保留190快照。"],
],
194:[
 ["taiyiling","脂习",null,null,false,"sgz11","汉太医令，天子西迁东归皆从。"],
 ["shizhong","刘艾",null,null,false,"han72","从董卓长史入献帝朝臣，194侍中任期为近似，非袁曹私官。"],
],
200:[
 ["taiyiling","脂习",null,null,false,"sgz11","与吉本就任时点未能精定，原表吉本优先，保留此候选及不覆盖理由。"],
 ["shizhong","刘艾",null,null,false,"han72","献帝朝史官、侍中；确切任年未详，按建安朝臣配置。"],
 ["taichang","赵岐",null,null,false,"han64","曹操举赵岐自代，桓典孔融上书荐，遂就拜太常，建安六年卒。"],
 ["taishou","王谋","巴郡",null,true,"sgz45","刘璋时巴郡太守，任年近似；原表严颜优先，不覆盖。"],
],
208:[],
211:[
 ["taishou","裴潜","代郡",null,false,"sgz23","曹操定荆州后拜参军，迁代郡太守，数年归；具体年按211近似。"],
],
219:[
 ["taichang","赖恭",null,null,true,"sgz45","刘备为汉中王，用赖恭为太常，是刘备自署，不冒充许都朝廷任命。"],
 ["guanglu","黄柱",null,null,true,"sgz45","汉中王府光禄勋，按诸侯自署记。"],
 ["shaofu","王谋",null,null,true,"sgz45","刘备为汉中王，以王谋为少府，按自署处理。"],
],
};
export const literatureExtraPosts={
 190:[{holder:"苏固",force:"liu_yan",kind:"jun",commanderies:["汉中郡"],basis:"张鲁进军之前苏固为汉中太守；当前地图沿刘焉体系，不提前赋给张鲁独立辖区。"}],
 219:[{holder:"彭羕",force:"liu",kind:"jun",commanderies:["江阳郡"],basis:"彭羕由治中出为江阳太守，时点约在被诛前，219提前配置为推定；不将其府属身份冒写汉庭任命。"}],
};
