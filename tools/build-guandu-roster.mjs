import fs from "node:fs";

const source=JSON.parse(fs.readFileSync("game/data/reference/officers-san11.json","utf8")).officers;
const byName=new Map(source.map(item=>[item.name,item]));
const groups={
  cao:{city:"xuchang",names:["曹操","荀彧","夏侯惇","夏侯渊","曹仁","曹洪","许褚","张辽","徐晃","于禁","乐进","程昱","郭嘉","荀攸","贾诩","刘晔","满宠","李典","张绣","董昭","毛玠","钟繇","李通","臧霸","陈登","曹休","曹纯","陈群","司马朗","杨修","刘馥","梁习"]},
  yuan:{city:"ye",names:["袁绍","袁谭","袁熙","袁尚","颜良","文丑","张郃","高览","审配","逢纪","郭图","田丰","沮授","许攸","淳于琼","眭元进","吕威璜","辛评","辛毗","王修","陈琳","高干","高柔","苏由","吕旷","荀谌"]},
  liu:{city:"xiapi",names:["刘备","关羽","张飞","赵云","糜竺","糜芳","糜氏","孙乾","简雍"]},
  sun:{city:"jianye",names:["孙策","孙权","周瑜","程普","黄盖","韩当","太史慈","张昭","张纮","鲁肃","吕蒙","蒋钦","诸葛瑾","徐盛","凌操","吕岱"]},
  liu_biao:{city:"xiangyang",names:["刘表","蔡瑁","蒯越","蒯良","文聘","黄祖","刘琦","刘琮","王威","韩嵩","蔡和","蔡氏","蔡中","向朗","张允"]},
  neutral:{city:"xinye",status:"hidden",names:["司马懿","徐庶","庞统","诸葛亮"]}
};
const officers=[];
for(const [force,group] of Object.entries(groups))for(const name of group.names){const ref=byName.get(name);if(!ref)throw new Error(`参考人物库缺少：${name}`);let status=group.status||"serving";if(ref.deathYear&&ref.deathYear<200)status="dead";else if(ref.debutYear&&ref.debutYear>200)status="not_appeared";officers.push({...ref,force,city:group.city,status,loyalty:force==="neutral"?0:force==="cao"&&name==="曹操"?100:75,merit:0,office:"无",officeRank:0,stamina:100,experience:0,skills:ref.skill?[ref.skill]:[]})}
const placements={luoyang:["夏侯惇","钟繇","司马懿"],chenliu:["程昱","曹仁","张绣"],beiping:["袁熙","袁谭","王修"],shouchun:["程普","黄盖","韩当"]};
for(const [city,names] of Object.entries(placements))for(const name of names){const officer=officers.find(item=>item.name===name);if(officer)officer.city=city}
fs.writeFileSync("game/data/history/officers/200_guandu.json",JSON.stringify({schema_version:3,as_of:"200-01",source:"koei-san11-reference + curated historical affiliation",historical_scope:"势力归属按官渡战争初期校正；城市为当前简化地图中的势力驻地，不代表人物逐月精确驻防位置。",officers},null,2)+"\n");
console.log(`官渡剧本已生成 ${officers.length} 名登场人物。`);
