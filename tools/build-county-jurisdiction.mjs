// 按县级层级（普通县、郡治、州治）重写县治的 jurisdictionCityId：县邑据点只领本县，无据点的县归本郡郡治。
// 只改写 administrative_divisions.json 中 county_seats 的归属字段，不动坐标、人口、地形与郡界。--check 只校验。
import fs from "node:fs";
globalThis.window=globalThis;
await import("../js/core/map-grid.js");
const path="game/data/history/administrative_divisions.json",divisions=JSON.parse(fs.readFileSync(path,"utf8")),cities=JSON.parse(fs.readFileSync("game/data/history/cities/200_guandu.json","utf8")).cities;
const counties=structuredClone(divisions.county_seats);MapGrid.assignCountyJurisdiction(counties,cities,divisions);
let changed=0;divisions.county_seats=divisions.county_seats.map((county,index)=>{const next=counties[index].jurisdictionCityId;if(next!==county.jurisdictionCityId)changed++;return {...county,jurisdictionCityId:next}});
if(process.argv.includes("--check")){if(changed)throw new Error(`${changed} 个县治归属与县级层级不一致，请运行 node tools/build-county-jurisdiction.mjs`);console.log("县治归属一致");}
else{fs.writeFileSync(path,`${JSON.stringify(divisions,null,2)}\n`);console.log(`县治归属已按县级层级重写：${changed} 县改归郡治`)}
