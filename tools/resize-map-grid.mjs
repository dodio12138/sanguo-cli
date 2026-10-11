import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
globalThis.window??=globalThis;
await import("../js/core/map-grid.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));

export function resizeLayout(input,width=100,height=100){
  const next=MapGrid.resizeSource({map:input.map,cities:input.cities,counties:input.divisions.county_seats,administrativeDivisions:input.divisions},width,height),map=next.map;
  if(MapGrid.dimensions(input.map).width===width&&MapGrid.dimensions(input.map).height===height)return {...input,layers:MapGrid.layers(input.map)};
  const revision=input.map.layout_revision;if(!revision||!/^[\w-]+$/.test(revision))throw new Error("原图缺少有效版次，不能创建映射基线");
  const archiveFile=`game/data/map/layouts/${revision}.json`;
  map.grid_mapping.archive_file=archiveFile;
  map.layout_revision=`commandery-105-grid-${width}-v1`;
  map.layout_archive_files={...(input.map.layout_archive_file?{[input.map.legacy_revision]:input.map.layout_archive_file}:{}),...input.map.layout_archive_files,[revision]:archiveFile};
  map.projection_note=`从${map.grid_mapping.from.width}×${map.grid_mapping.from.height}基准等比例映射到${width}×${height}；分层按格中心取样，节点与道路同步换算。`;
  return {map,cities:next.cities,divisions:next.administrativeDivisions,layers:MapGrid.layers(map)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input={map:read("game/data/map/central_plains.json"),cities:read("game/data/history/cities/200_guandu.json").cities,divisions:read("game/data/history/administrative_divisions.json")},next=resizeLayout(input);
  const result=MapGrid.validate({...next.layers,cities:next.cities,counties:next.divisions.county_seats});if(!result.ok)throw new Error(result.errors.join("\n"));
  console.log(`网格映射：${MapGrid.dimensions(input.map).width}×${MapGrid.dimensions(input.map).height} → ${next.layers.width}×${next.layers.height}；${next.cities.length}据点 / ${next.divisions.county_seats.length}县治 / ${next.map.roads.length}条道路。`);
  if(process.argv.includes("--write")&&input.map.layout_revision!==next.map.layout_revision){
    const archive=path.join(root,next.map.grid_mapping.archive_file);
    if(fs.existsSync(archive))throw new Error("映射基线归档已存在，停止以避免覆盖");
    fs.mkdirSync(path.dirname(archive),{recursive:true});
    fs.writeFileSync(archive,JSON.stringify({revision:input.map.layout_revision,map:input.map,cities:input.cities,counties:input.divisions.county_seats,divisions:input.divisions},null,2)+"\n");
    for(const [file,value]of [["game/data/map/central_plains.json",next.map],["game/data/history/cities/200_guandu.json",{...read("game/data/history/cities/200_guandu.json"),cities:next.cities}],["game/data/history/administrative_divisions.json",next.divisions]])fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+"\n");
  }else if(!process.argv.includes("--write"))console.log("仅预览；加 --write 才保存，并先归档原图。");
}
