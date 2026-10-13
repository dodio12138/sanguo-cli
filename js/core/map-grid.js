window.MapGrid = class MapGrid {
  static SCHEMA=1;
  static DEFAULT_WIDTH=60;
  static DEFAULT_HEIGHT=60;
  static TERRAIN_ORDER=["plains","grassland","hills","mountain","plateau","basin","desert","forest","marsh","ocean"];
  static LAND_SPANS=[[0,31],[0,34],[0,34],[0,33],[0,32],[0,31],[0,29],[0,28],[0,28],[0,28],[0,29],[0,30],[0,30],[0,29],[0,29],[0,29],[0,30],[0,30],[0,30],[0,30],[0,31],[0,31],[0,31],[0,32],[0,33],[0,32],[0,30],[0,28],[0,25],[0,24],[0,23],[0,22]];
  static SEA_EDGE=[31,34,34,33,32,31,29,28,28,28,29,30,30,29,29,29,30,30,30,30,31,31,31,32,33,32,30,28,25,24,23,22];
  static DEFAULT_WATERWAYS=[
    {name:"黄河",points:[[0,11],[4,11],[7,9],[10,10],[13,12],[16,12],[18,13],[20,12],[23,11],[26,10],[29,11],[30,9]]},
    {name:"长江",points:[[0,27],[5,26],[8,24],[11,24],[14,22],[17,23],[19,24],[22,23],[25,22],[28,23],[30,21]]},
    {name:"汉水",points:[[14,18],[15,20],[17,21],[19,23]]},
    {name:"淮水",points:[[20,18],[22,18],[24,19],[25,20],[27,20],[29,19]]},
    {name:"渭水",points:[[8,14],[11,14],[13,15],[16,16]]},
    {name:"辽水",points:[[29,2],[30,5],[31,7]]},
    {name:"海河",points:[[19,5],[21,7],[23,9],[24,10]]},
    {name:"湘水",points:[[18,31],[19,28],[19,26],[20,24]]},
    {name:"赣水",points:[[25,28],[25,26],[24,24],[24,23]]},
    {name:"珠江",points:[[14,31],[18,30],[22,30],[25,29]]}
  ];
  static DEFAULT_LANDMARKS=[
    {name:"祁连山",x:5,y:12,type:"mountain"},{name:"太行山",x:16,y:9,type:"mountain"},{name:"泰山",x:27,y:12,type:"mountain"},
    {name:"秦岭",x:11,y:18,type:"mountain"},{name:"大巴山",x:10,y:22,type:"mountain"},{name:"洞庭湖",x:19,y:27,type:"lake"},
    {name:"鄱阳湖",x:24,y:25,type:"lake"},{name:"云梦泽",x:21,y:25,type:"lake"},{name:"巢湖",x:27,y:19,type:"lake"}
  ];
  static isLand(x,y){
    const spans=MapGrid.LAND_SPANS,mainland=y>=0&&y<spans.length&&x>=spans[y][0]&&x<=spans[y][1];
    const hainan=y>=29&&y<=30&&x>=21&&x<=23,taiwan=y>=20&&y<=24&&x>=36&&x<=37;
    return mainland||hainan||taiwan;
  }
  static isOcean(x,y){
    if(MapGrid.isLand(x,y))return false;
    const edge=MapGrid.SEA_EDGE;
    if(y>=0&&y<edge.length&&x>edge[y])return true;
    if(y>=29)return x>=24;
    return false;
  }
  static provinceAt(x,y){
    if(MapGrid.isOcean(x,y)){if(y<9)return"渤海";if(y<14)return"黄海";if(y<20)return"东海";return"南海"}
    if(!MapGrid.isLand(x,y))return"域外";
    if(x>=36&&y>=20&&y<=24)return"夷州";
    if(y<=7&&x>=21)return"幽州";if(y<=12&&x<17)return x<9?"凉州":"并州";if(y<=13&&x>=24)return"青州";if(y<=13&&x>=17)return"冀州";
    if(x<=12&&y<=18)return"凉州";if(x<=14&&y>=19)return"益州";if(y<=18&&x<=18)return"司隶";if(y<=15&&x>=27)return"青州";if(y<=19&&x>=27)return"徐州";if(y<=18&&x>=19&&x<=26)return x>=25?"徐州":"兖州";
    if(x>=24&&y>=18&&y<=27)return"扬州";if(y>=19&&x<=23)return"荆州";if(y>=28)return"交州";return"豫州";
  }
  static terrainAt(x,y){
    if(MapGrid.isOcean(x,y))return"ocean";
    const variation=Math.sin(x*.95+y*.63)+Math.cos(y*.81-x*.29);
    if(!MapGrid.isLand(x,y)){
      if(y<7)return (x+y*2)%5===0?"mountain":"grassland";
      if(y<13)return (x+2*y)%4===0?"hills":x<5?"desert":"grassland";
      if(x<9||y>20)return (2*x+y)%4<2?"plateau":"mountain";
      return variation>1.1?"forest":"hills";
    }
    if(x<=6&&y>=6&&y<=13)return y===6||variation>1.1?"mountain":"desert";
    if(x>=4&&x<=13&&y>=8&&y<=15)return variation>.65?"hills":"grassland";
    if(x<=11&&y>=13&&y<=22)return variation>.9?"mountain":"plateau";
    if(x>=11&&x<=18&&y>=19&&y<=26)return (x===11||y===19||variation>1.35)?"mountain":"basin";
    if(x>=12&&x<=21&&y>=25)return variation>.4?"mountain":"plateau";
    if(x>=13&&x<=20&&y>=7&&y<=16)return variation>.6?"hills":"plateau";
    if(x>=26&&y<=5)return"mountain";if(y<=5)return variation>.55?"hills":"grassland";
    if((x+y*2)%13===0)return"forest";if(y>=19&&x>=23)return"marsh";return variation>1.35?"hills":"plains";
  }
  static dimensions(map={}){return {width:Number(map.width??map.grid?.width)||MapGrid.DEFAULT_WIDTH,height:Number(map.height??map.grid?.height)||MapGrid.DEFAULT_HEIGHT}}
  static remapPoint(x,y,from,to){return {x:Math.min(to.width-1,Math.floor((x+.5)*to.width/from.width)),y:Math.min(to.height-1,Math.floor((y+.5)*to.height/from.height))}}
  static groundDistance(map,a,b){const scale=map?.distance_scale;return Math.hypot(((a.x||0)-(b.x||0))/(scale?.x||1),((a.y||0)-(b.y||0))/(scale?.y||1))}
  static resampleLayer(values,from,to){
    if(!Array.isArray(values)||values.length!==from.width*from.height)throw new Error("映射分层尺寸不一致");
    return Array.from({length:to.width*to.height},(_,index)=>{const x=index%to.width,y=Math.floor(index/to.width),sx=Math.min(from.width-1,Math.floor((x+.5)*from.width/to.width)),sy=Math.min(from.height-1,Math.floor((y+.5)*from.height/to.height));return values[sy*from.width+sx]});
  }
  static gridLine(x,y,tx,ty){const points=[[x,y]],nx=Math.abs(tx-x),ny=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y);let ix=0,iy=0;while(ix<nx||iy<ny){if(ix<nx&&(iy===ny||(1+2*ix)*ny<(1+2*iy)*nx)){x+=sx;ix++}else{y+=sy;iy++}points.push([x,y])}return points}
  static resizeSource(source,width,height){
    const from=MapGrid.dimensions(source.map),to={width,height};
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<from.width||height<from.height||width>256||height>256)throw new Error("网格只能扩展，最大为256×256");
    const next=structuredClone(source);if(width===from.width&&height===from.height)return next;
    const point=node=>({...node,...MapGrid.remapPoint(node.x,node.y,from,to)}),map=next.map;
    const layers=MapGrid.layers(source.map,source.cities,source.counties||source.administrativeDivisions?.county_seats);
    for(const key of ["terrain","provinces","commanderies"])map[key]=MapGrid.encode(MapGrid.resampleLayer(layers[key],from,to));
    if(map.pixel_mask)map.pixel_mask=MapGrid.encode(MapGrid.resampleLayer(MapGrid.decode(map.pixel_mask,from.width*from.height),from,to));
    next.cities=(next.cities||[]).map(point);next.counties=(next.counties||next.administrativeDivisions?.county_seats||[]).map(point);
    const points=list=>list.map(([x,y])=>{const p=MapGrid.remapPoint(x,y,from,to);return [p.x,p.y]});
    const corners=list=>list.map(([x,y])=>[Math.round(x*to.width/from.width),Math.round(y*to.height/from.height)]);
    map.waterways=MapGrid.waterways(source.map).map(river=>({...river,points:MapGrid.isCornerRiver(river)?corners(river.points):points(river.points)}));map.landmarks=MapGrid.landmarks(source.map).map(point);
    map.commanderySeats=(map.commanderySeats||[]).map(point);
    map.roads=(source.map.roads||[]).map(route=>{
      const mapped=points(MapGrid.decodeRoadPath(route)),path=[];
      for(const p of mapped){if(!path.length)path.push(p);else path.push(...MapGrid.gridLine(...path.at(-1),...p).slice(1))}
      const {points:unused,...metadata}=route;return {...metadata,path:MapGrid.encodeRoadPath(path)};
    });
    if(next.administrativeDivisions){if(next.administrativeDivisions.county_seats)next.administrativeDivisions.county_seats=structuredClone(next.counties);if(next.administrativeDivisions.commandery_seats_140)next.administrativeDivisions.commandery_seats_140=next.administrativeDivisions.commandery_seats_140.map(point)}
    map.width=width;map.height=height;map.grid={...map.grid,width,height};
    map.distance_scale={x:(source.map.distance_scale?.x||1)*width/from.width,y:(source.map.distance_scale?.y||1)*height/from.height};
    map.grid_mapping={from,to,method:"cell-center-nearest",sourceRevision:source.map.layout_revision||null};
    if(map.pixel_scale)map.pixel_scale*=width/from.width;
    return next;
  }
  static encode(values){
    const parts=[];
    for(const value of values){
      const text=value==null?"":String(value);
      if(text.includes("*")||text.includes(","))throw new Error(`舆图分层取值不能包含 * 或 ,：${text}`);
      const last=parts[parts.length-1];
      if(last&&last[0]===text)last[1]+=1;else parts.push([text,1]);
    }
    return parts.map(([text,count])=>`${text}*${count}`).join(",");
  }
  static decode(text,length){
    if(!text)return null;
    const values=[];
    for(const part of String(text).split(",")){
      if(!part)continue;
      const mark=part.lastIndexOf("*"),value=part.slice(0,mark),count=Number(part.slice(mark+1));
      if(mark<0||!Number.isInteger(count)||count<1)throw new Error(`舆图分层数据损坏：${part}`);
      if((Number.isInteger(length)&&values.length+count>length)||values.length+count>1000000)throw new Error("舆图分层长度超出地图范围");
      for(let index=0;index<count;index++)values.push(value||null);
    }
    if(Number.isInteger(length)&&values.length!==length)throw new Error(`舆图分层长度应为 ${length}，实际 ${values.length}`);
    return values;
  }
  static decodeLayer(map,key,width,height){return map&&map[key]?MapGrid.decode(map[key],width*height):null}
  static blank(width,height,fill){return Array.from({length:width*height},()=>fill)}
  static defaultTerrain(width,height,map=null){return MapGrid.decodeLayer(map,"terrain",width,height)||Array.from({length:width*height},(_,index)=>MapGrid.terrainAt(index%width,Math.floor(index/width)))}
  static defaultProvinces(width,height,map=null){return MapGrid.decodeLayer(map,"provinces",width,height)||Array.from({length:width*height},(_,index)=>MapGrid.provinceAt(index%width,Math.floor(index/width)))}
  static seatSources(cities=[],counties=[]){const seats=counties.length?counties:cities.filter(city=>city.commandery&&city.commandery!=="史籍未详");return seats}
  static nearestSeat(x,y,seats){
    let best=null,bestDistance=Infinity,bestCapital=-1;
    for(const seat of seats){const distance=Math.hypot(x-seat.x,y-seat.y),capital=Number(seat.capital)?1:0;if(distance<bestDistance||(distance===bestDistance&&capital>bestCapital)){best=seat;bestDistance=distance;bestCapital=capital}}
    return best;
  }
  static defaultCommanderies(width,height,cities=[],counties=[],map=null){
    const authored=MapGrid.decodeLayer(map,"commanderies",width,height);if(authored)return authored;
    const seats=MapGrid.seatSources(cities,counties),values=[],terrainLayer=MapGrid.defaultTerrain(width,height,map),provinceLayer=MapGrid.defaultProvinces(width,height,map);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const index=y*width+x,terrain=terrainLayer[index],province=provinceLayer[index],seat=terrain==="ocean"||province==="域外"?null:MapGrid.nearestSeat(x,y,seats);
      values.push(seat?.commandery||(terrain==="ocean"||province==="域外"?null:"史籍未详"));
    }
    return values;
  }
  static administrativeLayers({width,height,terrain,provinces,commanderies,map={},cities=[],counties=[],divisions={}}){
    const owners=commanderies.map((name,index)=>terrain[index]==="ocean"?null:name),mapping=Object.create(null),votes=new Map(),validProvince=name=>typeof name==="string"&&name&&!['域外','渤海','黄海','东海','南海'].includes(name);
    const declare=(name,province)=>{if(name&&validProvince(province)&&!Object.hasOwn(mapping,name))mapping[name]=province};
    for(const [name,province] of Object.entries(map.commandery_provinces||{}))declare(name,province);
    for(const seat of [...(divisions.commandery_seats_140||[]),...(map.commanderySeats||[])])declare(seat.name,seat.mapProvince||seat.province);
    for(let index=0;index<owners.length;index++)if(owners[index]&&validProvince(provinces[index])){const counts=votes.get(owners[index])||new Map();counts.set(provinces[index],(counts.get(provinces[index])||0)+1);votes.set(owners[index],counts)}
    for(const [name,counts] of votes)declare(name,[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh'))[0][0]);
    for(const node of [...counties,...cities])declare(node.commandery,node.province);
    // Only fill unassigned land. Existing hand-drawn ownership and terrain are immutable here.
    const queue=[],seeds=[];
    for(let index=0;index<owners.length;index++)if(owners[index]){queue.push(index);seeds.push(index)}
    const neighbors=index=>{const x=index%width,y=Math.floor(index/width);return [x>0?index-1:-1,x+1<width?index+1:-1,y>0?index-width:-1,y+1<height?index+width:-1]};
    for(let cursor=0;cursor<queue.length;cursor++){const index=queue[cursor];for(const next of neighbors(index))if(next>=0&&terrain[next]!=="ocean"&&!owners[next]){owners[next]=owners[index];queue.push(next)}}
    // A newly drawn island may have no land-connected seed; attach its whole component once.
    for(let index=0;index<owners.length;index++)if(terrain[index]!=="ocean"&&!owners[index]&&seeds.length){let nearest=seeds[0],distance=Infinity;for(const seed of seeds){const value=(index%width-seed%width)**2+(Math.floor(index/width)-Math.floor(seed/width))**2;if(value<distance){distance=value;nearest=seed}}const component=[index];owners[index]=owners[nearest];for(let cursor=0;cursor<component.length;cursor++)for(const next of neighbors(component[cursor]))if(next>=0&&terrain[next]!=="ocean"&&!owners[next]){owners[next]=owners[index];component.push(next)}}
    return {commanderies:owners,provinces:owners.map((name,index)=>terrain[index]==="ocean"?null:mapping[name]||null),commanderyProvinces:{...mapping}};
  }
  static layers(map,cities=[],counties=[],divisions={}){
    const {width,height}=MapGrid.dimensions(map);
    const terrain=MapGrid.defaultTerrain(width,height,map),provinces=MapGrid.defaultProvinces(width,height,map),commanderies=MapGrid.defaultCommanderies(width,height,cities,counties,map);
    return {width,height,terrain,...MapGrid.administrativeLayers({width,height,terrain,provinces,commanderies,map,cities,counties,divisions})};
  }
  static syncAdministrativeRegions(data){
    if(!data?.map)return;
    const counties=data.counties||data.administrativeDivisions?.county_seats||[],layers=MapGrid.layers(data.map,data.cities||[],counties,data.administrativeDivisions||{});
    data.map.provinces=MapGrid.encode(layers.provinces);data.map.commanderies=MapGrid.encode(layers.commanderies);data.map.commandery_provinces=layers.commanderyProvinces;
    for(const node of [...(data.cities||[]),...counties,...(data.map.commanderySeats||[])])if(Number.isInteger(node.x)&&Number.isInteger(node.y)&&node.x>=0&&node.y>=0&&node.x<layers.width&&node.y<layers.height){const index=node.y*layers.width+node.x;node.province=layers.provinces[index]||"";node.commandery=layers.commanderies[index]||"";if((data.map.commanderySeats||[]).includes(node))node.mapProvince=node.province}
    if(data.administrativeDivisions?.county_seats)data.administrativeDivisions.county_seats=structuredClone(counties);
    if(data.administrativeDivisions?.commandery_seats_140&&data.map.commanderySeats)data.administrativeDivisions.commandery_seats_140=structuredClone(data.map.commanderySeats);
    return layers;
  }
  static waterways(map){return Array.isArray(map?.waterways)?structuredClone(map.waterways):structuredClone(MapGrid.DEFAULT_WATERWAYS)}
  // 角点河流（anchor:"corner"）的控制点落在格子角上，相邻控制点之间沿格线按台阶展开；旧河流仍以格心折线表示。
  static isCornerRiver(river){return river?.anchor==="corner"}
  static riverCorners(river){const points=Array.isArray(river?.points)?river.points:[];if(!MapGrid.isCornerRiver(river))return structuredClone(points);const path=[];for(const [x,y] of points){const last=path.at(-1);if(!last){path.push([x,y]);continue}path.push(...MapGrid.gridLine(last[0],last[1],x,y).slice(1))}return path}
  static riverEdgeCells(a,b){return a[1]===b[1]?[[Math.min(a[0],b[0]),a[1]-1],[Math.min(a[0],b[0]),a[1]]]:[[a[0]-1,Math.min(a[1],b[1])],[a[0],Math.min(a[1],b[1])]]}
  static riverCrossings(map){const {width}=MapGrid.dimensions(map),pairs=new Set();for(const river of MapGrid.waterways(map)){if(!MapGrid.isCornerRiver(river))continue;const path=MapGrid.riverCorners(river);for(let i=1;i<path.length;i++){const [[ax,ay],[bx,by]]=MapGrid.riverEdgeCells(path[i-1],path[i]),a=ay*width+ax,b=by*width+bx;pairs.add(a<b?`${a}|${b}`:`${b}|${a}`)}}return pairs}
  static landmarks(map){return Array.isArray(map?.landmarks)?structuredClone(map.landmarks):structuredClone(MapGrid.DEFAULT_LANDMARKS)}
  static roadEdges(graph={},cityIds=null){
    const edges=[];
    for(const [from,targets] of Object.entries(graph||{}))for(const to of targets||[]){
      if(from>=to)continue;
      if(cityIds&&(!cityIds.has(from)||!cityIds.has(to)))continue;
      edges.push([from,to]);
    }
    return edges.sort((a,b)=>a[0]===b[0]?a[1].localeCompare(b[1]):a[0].localeCompare(b[0]));
  }
  static routePath(map,from,to,used=new Uint16Array(0)){
    const {width,height}=MapGrid.dimensions(map),inside=point=>Number.isInteger(point?.x)&&Number.isInteger(point?.y)&&point.x>=0&&point.y>=0&&point.x<width&&point.y<height;
    if(!inside(from)||!inside(to))return [];
    const layers=MapGrid.layers(map),length=width*height,start=from.y*width+from.x,goal=to.y*width+to.x;
    if(start===goal)return [[from.x,from.y]];
    const terrainCost={plains:1,grassland:1.08,basin:1.12,hills:1.55,forest:1.8,plateau:2.25,desert:2.7,marsh:3.1,mountain:4.2,ocean:Infinity},riverCells=new Uint8Array(length),waterways=MapGrid.waterways(map).filter(river=>!MapGrid.isCornerRiver(river)),crossings=MapGrid.riverCrossings(map);
    for(const river of waterways)for(let i=1;i<(river.points||[]).length;i++){
      let [x,y]=river.points[i-1], [tx,ty]=river.points[i];
      while(x!==tx||y!==ty){const index=y*width+x;if(index>=0&&index<length)riverCells[index]=1;if(x!==tx)x+=Math.sign(tx-x);else y+=Math.sign(ty-y)}
      const index=ty*width+tx;if(index>=0&&index<length)riverCells[index]=1;
    }
    const distance=new Float64Array(length);distance.fill(Infinity);distance[start]=0;
    const previous=new Int32Array(length);previous.fill(-1);
    const heap=[];const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p}heap[i]=item};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child}heap[i]=last}return first};
    const heuristic=index=>Math.abs(index%width-to.x)+Math.abs(Math.floor(index/width)-to.y);push({index:start,score:heuristic(start)});
    while(heap.length){const current=pop(),index=current.index;if(index===goal)break;if(current.score-heuristic(index)>distance[index]+1e-7)continue;const x=index%width,y=Math.floor(index/width);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const next=ny*width+nx,terrain=layers.terrain[next],base=terrainCost[terrain]??1.7;if(!Number.isFinite(base)&&next!==goal)continue;
        const reused=used[next]||0,river=crossings.has(index<next?`${index}|${next}`:`${next}|${index}`)?1.7:riverCells[next]&&!riverCells[index]?1.7:riverCells[next]?1.2:0,boundary=(layers.commanderies[next]!==layers.commanderies[index]?0.22:0)+(layers.provinces[next]!==layers.provinces[index]?0.12:0),step=base+river+boundary+reused*24,candidate=distance[index]+step;
        if(candidate>=distance[next])continue;distance[next]=candidate;previous[next]=index;push({index:next,score:candidate+heuristic(next)});
      }
    }
    if(!Number.isFinite(distance[goal]))return [];
    const path=[];for(let index=goal;index!==-1;index=previous[index]){path.push([index%width,Math.floor(index/width)]);if(index===start)break}path.reverse();return path;
  }
  static encodeRoadPath(points=[]){if(!points.length)return"";let [x,y]=points[0];const moves=[];for(let i=1;i<points.length;i++){const [tx,ty]=points[i],dx=tx-x,dy=ty-y;moves.push(dx===1?"E":dx===-1?"W":dy===1?"S":dy===-1?"N":"?");x=tx;y=ty}return `${points[0][0]},${points[0][1]}:${moves.join("")}`}
  static decodeRoadPath(route={}){if(Array.isArray(route.points))return route.points;const [origin,moves=""]=String(route.path||"").split(":"),[sx,sy]=origin.split(",").map(Number);if(!Number.isInteger(sx)||!Number.isInteger(sy))return[];let x=sx,y=sy;const points=[[x,y]];for(const move of moves){if(move==="E")x++;else if(move==="W")x--;else if(move==="S")y++;else if(move==="N")y--;else return[];points.push([x,y])}return points}
  static serializeRoadNetwork(routes=[]){return routes.map(({points,...route})=>({...route,path:MapGrid.encodeRoadPath(points)}))}
  static generateRoadNetwork(map={},cities=[],counties=[],graph={},reservedRoutes=[]){
    const commanderySeats=map.commanderySeats||[],cityById=new Map(cities.map(city=>[city.id,city])),countyById=new Map(counties.map(county=>[county.id,county])),seatById=new Map(commanderySeats.map(seat=>[seat.id,seat])),nodes=new Map([...cityById,...countyById,...seatById]),used=new Uint16Array(MapGrid.dimensions(map).width*MapGrid.dimensions(map).height),roads=[],seen=new Set();
    for(const route of reservedRoutes)for(const [x,y] of MapGrid.decodeRoadPath(route)){const index=y*MapGrid.dimensions(map).width+x;if(index>=0&&index<used.length)used[index]++}
    const add=(from,to,kind)=>{if(!from||!to||from.id===to.id||!Number.isInteger(from.x)||!Number.isInteger(to.x)||!Number.isInteger(from.y)||!Number.isInteger(to.y))return;const a=`${from.id}`,b=`${to.id}`,key=[a,b].sort().join("|");if(seen.has(key))return;seen.add(key);const points=MapGrid.routePath(map,from,to,used);if(!points.length)return;for(const [x,y] of points)used[y*MapGrid.dimensions(map).width+x]++;roads.push({id:`${kind}:${key}`,from:a,to:b,kind,points})};
    for(const [from,to] of MapGrid.roadEdges(graph, new Set(cityById.keys())))add(cityById.get(from),cityById.get(to),"main");
    const groups=new Map();for(const seat of counties){const list=groups.get(seat.commandery)||[];list.push(seat);groups.set(seat.commandery,list)}
    const commanderyRoots=[];
    for(const [commandery,seats] of groups){if(!seats.length)continue;const root=seats.find(seat=>seat.rank==="commandery"||seat.capital)||seats[0],connected=new Set([root.id]);commanderyRoots.push(root);
      while(connected.size<seats.length){let best=null,bestDistance=Infinity;for(const aId of connected){const a=countyById.get(aId);for(const b of seats)if(!connected.has(b.id)){const distance=Math.hypot(a.x-b.x,a.y-b.y)+(a.province===b.province?0:4);if(distance<bestDistance){bestDistance=distance;best=[a,b]}}}if(!best)break;add(best[0],best[1],"county");connected.add(best[1].id)}
      const anchor=cityById.get(root.cityId||root.jurisdictionCityId);if(anchor)add(root,anchor,"commandery");
    }
    for(const seat of commanderySeats){const anchor=cities.filter(city=>city.force!=="neutral").sort((a,b)=>{const sameA=a.commandery===seat.name?0:1,sameB=b.commandery===seat.name?0:1;return sameA-sameB||Math.hypot(a.x-seat.x,a.y-seat.y)-Math.hypot(b.x-seat.x,b.y-seat.y)})[0];if(anchor)add(seat,anchor,"commandery")}
    const provinces=new Map();for(const root of commanderyRoots){const list=provinces.get(root.province)||[];list.push(root);provinces.set(root.province,list)}for(const seat of commanderySeats){const province=seat.mapProvince||seat.province,list=provinces.get(province)||[];list.push(seat);provinces.set(province,list)}
    for(const roots of provinces.values()){if(roots.length<2)continue;const connected=new Set([roots[0].id]);while(connected.size<roots.length){let best=null,bestDistance=Infinity;for(const aId of connected){const a=nodes.get(aId);for(const b of roots)if(!connected.has(b.id)){const distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance<bestDistance){bestDistance=distance;best=[a,b]}}}if(!best)break;add(best[0],best[1],"province");connected.add(best[1].id)}}
    return roads;
  }
  static roadNetwork(map={},cities=[],counties=[],graph={}){
    const cityById=new Map(cities.map(city=>[city.id,city])),countyById=new Map(counties.map(county=>[county.id,county])),seatById=new Map((map.commanderySeats||[]).map(seat=>[seat.id,seat])),nodes=new Map([...cityById,...countyById,...seatById]),stored=Array.isArray(map.roads)?map.roads:[],cityEdges=new Set(MapGrid.roadEdges(graph,new Set(cityById.keys())).map(([a,b])=>`${a}|${b}`)),routes=[];
    const matches=(route)=>{const from=nodes.get(route.from),to=nodes.get(route.to),points=MapGrid.decodeRoadPath(route);return from&&to&&points.length&&points[0][0]===from.x&&points[0][1]===from.y&&points.at(-1)[0]===to.x&&points.at(-1)[1]===to.y};
    for(const storedRoute of stored){const route={...storedRoute,points:MapGrid.decodeRoadPath(storedRoute)};if(route.kind==="main"){const key=[route.from,route.to].sort().join("|");if(!cityEdges.has(key)||!matches(route))continue}else if(!matches(route))continue;routes.push(route)}
    return routes;
  }
  static roadNeighbors(graph,id){return [...new Set(graph?.[id]||[])].filter(other=>other!==id)}
  static setRoad(graph,from,to,connected=true){
    const target=graph||{};
    if(!from||!to||from===to)return false;
    target[from]??=[];target[to]??=[];
    const linked=target[from].includes(to);
    if(connected===linked)return false;
    if(connected){target[from].push(to);target[to].push(from)}
    else{target[from]=target[from].filter(id=>id!==to);target[to]=target[to].filter(id=>id!==from)}
    return true;
  }
  static connectivity(graph={},cityIds=[]){
    const ids=[...cityIds],seen=new Set(),groups=[];
    for(const id of ids){
      if(seen.has(id))continue;
      const stack=[id],group=[];seen.add(id);
      while(stack.length){const node=stack.pop();group.push(node);for(const next of MapGrid.roadNeighbors(graph,node))if(!seen.has(next)&&ids.includes(next)){seen.add(next);stack.push(next)}}
      groups.push(group);
    }
    return groups;
  }
  static validate({width,height,terrain,provinces,commanderies,cities=[],counties=[],graph=null,terrainIds=null}){
    const errors=[],warnings=[],size=(Number(width)||0)*(Number(height)||0);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4)errors.push("地图尺寸无效");
    for(const [name,column] of [["地形",terrain],["州域",provinces],["郡域",commanderies]]){
      if(!Array.isArray(column)||column.length!==size){errors.push(`${name}分层应包含 ${size} 格`);continue}
      if(name==="地形"&&terrainIds)column.forEach((value,index)=>{if(value&&!terrainIds.includes(value))errors.push(`第 ${index%width},${Math.floor(index/width)} 格地形未知：${value}`)});
      if(name==="地形")column.forEach((value,index)=>{if(!value)errors.push(`第 ${index%width},${Math.floor(index/width)} 格缺少地形`)});
    }
    const cityIds=new Set(),cells=new Map();
    for(const city of cities||[]){
      if(!city.id)errors.push(`据点缺少 ID：${city.name||"?"}`);
      else if(cityIds.has(city.id))errors.push(`据点 ID 重复：${city.id}`);
      cityIds.add(city.id);
      if(!city.name)errors.push(`据点 ${city.id||"?"} 缺少名称`);
      if(!city.force)errors.push(`据点 ${city.name||city.id||"?"} 缺少所属势力`);
      if(!Number.isInteger(city.x)||!Number.isInteger(city.y)||city.x<0||city.y<0||city.x>=width||city.y>=height)errors.push(`据点 ${city.name||city.id||"?"} 坐标越界：${city.x},${city.y}`);
      else{
        const key=`${city.x},${city.y}`;
        if(cells.has(key))errors.push(`据点坐标重叠：${key}（${cells.get(key)} 与 ${city.name||city.id}）`);
        else cells.set(key,city.name||city.id);
        if(terrain&&terrain[city.y*width+city.x]==="ocean")warnings.push(`据点 ${city.name||city.id} 落在海面格上`);
      }
      if(city.population!==undefined&&(!Number.isFinite(city.population)||city.population<0))errors.push(`据点 ${city.name||city.id} 人口无效`);
      if(city.garrison!==undefined&&(!Number.isFinite(city.garrison)||city.garrison<0))errors.push(`据点 ${city.name||city.id} 守军无效`);
    }
    const countyCells=new Set();
    for(const county of counties||[]){
      if(!Number.isInteger(county.x)||!Number.isInteger(county.y)||county.x<0||county.y<0||county.x>=width||county.y>=height){errors.push(`县治 ${county.name||county.id||"?"} 坐标越界`);continue}
      const key=`${county.x},${county.y}`;
      if(countyCells.has(key))errors.push(`县治网格重叠：${key}`);
      countyCells.add(key);
      if(county.jurisdictionCityId&&!cityIds.has(county.jurisdictionCityId))errors.push(`县治 ${county.name||county.id} 管辖据点不存在：${county.jurisdictionCityId}`);
      if(county.cityId&&!cityIds.has(county.cityId))errors.push(`县治 ${county.name||county.id} 对齐据点不存在：${county.cityId}`);
      if(terrain&&terrain[county.y*width+county.x]==="ocean")warnings.push(`县治 ${county.name||county.id} 落在海面格上`);
    }
    if(graph)for(const [from,targets] of Object.entries(graph))for(const to of targets||[]){
      if(!cityIds.has(from))errors.push(`道路起点不存在：${from}`);
      if(!cityIds.has(to))errors.push(`道路终点不存在：${to}`);
      else if(!(graph[to]||[]).includes(from))errors.push(`道路不是双向连接：${from} → ${to}`);
    }
    return {ok:errors.length===0,errors,warnings};
  }
};
