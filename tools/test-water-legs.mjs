import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/map-grid.js");

const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8"));
const source=read("game/data/map/central_plains.json"),map={...source.grid,...source},cities=new Map(read("game/data/history/cities/200_guandu.json").cities.map(city=>[city.id,city])),network=read("game/data/map/route_network.json");
const corners=new Set(MapGrid.waterways(map).filter(MapGrid.isCornerRiver).flatMap(river=>MapGrid.riverCorners(river)).map(([x,y])=>`${x-.5},${y-.5}`));
const {width,height}=MapGrid.dimensions(map),terrain=MapGrid.decode(map.terrain,width*height);
let rivers=0,seas=0;
for(const route of network.routes){
  const kind=network.kinds[route.kind];if(kind.mode!=="water")continue;
  const a=cities.get(route.a),b=cities.get(route.b);
  if(route.kind==="sea"){const path=MapGrid.seaPath(map,a,b);if(!path)continue;for(const [x,y] of path.slice(1,-1))assert.equal(terrain[y*width+x],"ocean",`${route.name} 航线不得穿越陆地`);seas++;continue}
  const path=MapGrid.riverPath(map,a,b)||MapGrid.riverPath(map,a,b,6)||MapGrid.riverPath(map,a,b,12);if(!path)continue;
  assert.deepEqual(path[0],[a.x,a.y]);assert.deepEqual(path.at(-1),[b.x,b.y]);
  for(const [x,y] of path.slice(1,-1))assert.ok(corners.has(`${x},${y}`),`${route.name} ${a.name}—${b.name} 水路折点必须落在河道角点上`);
  rivers++;
}
assert.ok(rivers>=40,`水路沿河道寻路数量不足：${rivers}`);
const view=fs.readFileSync(new URL("../js/ui/map-view.js",import.meta.url),"utf8");
assert.ok(/MapGrid\.riverPath\(/.test(view)&&/MapGrid\.seaPath\(/.test(view),"行军水路应沿河道与海域绘制");
assert.ok(/drawMarchPath/.test(view),"进军路线应以带箭头的红线绘制");
const march=view.slice(view.indexOf("drawMarchPath(c,m,segments"),view.indexOf("splitPolyline(points"));
assert.ok(!/setLineDash/.test(march),"进军路线的水路段不另画虚线水道");
const legSource=view.slice(view.indexOf("legPoints(from,to"),view.indexOf("legSegments(ids,head"));
assert.ok(/else points=MapGrid\.riverPath\(map,a,b\)\|\|MapGrid\.riverPath\(map,a,b,6\)\|\|MapGrid\.riverPath\(map,a,b,12\);/.test(legSource),"河道绕远也沿河走，不因路长改成直线");
console.log(`水路行军走向通过：${rivers} 段沿河道角点，${seas} 段海路只经海域`);
