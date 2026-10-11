// Editor-only reference imagery. Assets and placement never enter game saves or map patches.
window.MapEditorReference=class MapEditorReference{
  static maxBytes=64*1024*1024;
  static maxPreviewSide=2048;
  static releaseImages(decoded){decoded?.preview?.close?.();decoded?.image?.close?.()}
  static validateFile(file){
    if(!file||!file.size)throw new Error("请选择图片文件。");
    if(!["image/png","image/jpeg","image/webp","image/bmp","image/x-ms-bmp"].includes(file.type))throw new Error("底图支持 PNG、JPG、WebP 和 BMP。");
    if(file.size>this.maxBytes)throw new Error("底图不能超过 64 MB。");
  }
  static async decodeImage(blob){
    let image;
    if(window.createImageBitmap)image=await window.createImageBitmap(blob);
    else{
      const url=URL.createObjectURL(blob);
      try{image=await new Promise((resolve,reject)=>{const item=new Image();item.onload=()=>resolve(item);item.onerror=()=>reject(new Error("无法读取图片。"));item.src=url})}
      finally{URL.revokeObjectURL(url)}
    }
    const width=image.width,height=image.height;
    if(!width||!height||width*height>100000000){image.close?.();throw new Error("图片尺寸过大或无效。")}
    let preview=null;
    if(window.createImageBitmap&&Math.max(width,height)>this.maxPreviewSide){
      try{const ratio=this.maxPreviewSide/Math.max(width,height);preview=await window.createImageBitmap(image,{resizeWidth:Math.max(1,Math.round(width*ratio)),resizeHeight:Math.max(1,Math.round(height*ratio)),resizeQuality:"high"})}
      catch{/* The original remains usable if the optional small preview cannot be allocated. */}
    }
    return {image,preview,width,height};
  }
  static fit(grid,width,height){const ratio=Math.min(grid.width/width,grid.height/height),w=width*ratio,h=height*ratio;return {x:(grid.width-w)/2,y:(grid.height-h)/2,width:w,height:h}}
  static normalize(value={},grid,asset){
    const fit=this.fit(grid,asset.width,asset.height),bounded=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback,limit=Math.max(grid.width,grid.height)*20;
    return {version:1,grid:{...grid},x:bounded(value.x,-limit,limit,fit.x),y:bounded(value.y,-limit,limit,fit.y),scale:bounded(value.scale,.1,10,1),opacity:bounded(value.opacity,0,1,.65),visible:value.visible!==false};
  }
  static remapPlacement(value,grid,asset){
    const from=value?.grid;
    if(!from||!Number.isFinite(from.width)||!Number.isFinite(from.height)||from.width<=0||from.height<=0)return this.normalize({},grid,asset);
    const sx=grid.width/from.width,sy=grid.height/from.height,oldFit=this.fit(from,asset.width,asset.height),newFit=this.fit(grid,asset.width,asset.height);
    return this.normalize({...value,x:value.x*sx,y:value.y*sy,scale:sx===sy?value.scale:value.scale*Math.min(sx,sy)*oldFit.width/newFit.width},grid,asset);
  }
  constructor({$,grid,onChange=()=>{},beforeAdjust=()=>{},output=()=>{},store,decode=blob=>MapEditorReference.decodeImage(blob)}={}){
    this.$=$;this.grid=grid;this.onChange=onChange;this.beforeAdjust=beforeAdjust;this.output=output;this.decode=decode;
    this.store=store===undefined?(window.indexedDB&&window.MapEditorDraftStore?new MapEditorDraftStore({database:"sanguo-map-reference",objectStore:"references",legacyPrefix:"sanguo.map-reference."}):null):store;
    this.key="";this.asset=null;this.placement=null;this.image=null;this.preview=null;this.adjusting=false;this.drag=null;this.loading=false;this.token=0;this.pending=Promise.resolve();this.timer=null;
    this.bind();this.sync();
  }
  enqueue(operation){const next=this.pending.catch(()=>{}).then(operation);this.pending=next;return next}
  async flush(){if(this.timer){clearTimeout(this.timer);this.timer=null;this.save()}await this.pending.catch(()=>{})}
  save(){
    if(!this.store||!this.placement)return Promise.resolve();
    const key=this.key,placement=structuredClone(this.placement);
    return this.enqueue(()=>this.store.transact("readwrite",store=>store.put(placement,`${key}:placement`))).catch(()=>this.output("底图位置未能保存，当前调整仍保留。"));
  }
  changed(persist=true){this.sync();this.onChange();if(persist){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;this.save()},200)}}
  release(){MapEditorReference.releaseImages(this);this.image=null;this.preview=null;this.asset=null;this.placement=null;this.drag=null;this.adjusting=false}
  async load(key){
    if(key!==this.key){this.loading=true;this.adjusting=false;this.changed(false)}
    await this.flush();this.adjusting=false;
    if(key===this.key){this.changed(false);return}
    const token=++this.token;this.key=key;this.release();this.loading=true;this.changed(false);
    try{
      if(!this.store)return;
      const [asset,saved]=await Promise.all([this.store.get(`${key}:image`),this.store.get(`${key}:placement`)]);
      if(token!==this.token||!asset)return;
      MapEditorReference.validateFile(asset.blob);const decoded=await this.decode(asset.blob);
      if(token!==this.token){MapEditorReference.releaseImages(decoded);return}
      this.asset={...asset,width:decoded.width,height:decoded.height};this.image=decoded.image;this.preview=decoded.preview||null;
      this.placement=saved?MapEditorReference.remapPlacement(saved,this.grid(),this.asset):MapEditorReference.normalize({},this.grid(),this.asset);
    }catch{if(token===this.token)this.output("底图无法载入，请重新添加图片。")}
    finally{if(token===this.token){this.loading=false;this.changed(false)}}
  }
  async add(file){
    MapEditorReference.validateFile(file);if(this.loading)throw new Error("底图正在载入，请稍候。");
    this.beforeAdjust();this.endDrag();await this.flush();const key=this.key,token=++this.token;this.loading=true;this.adjusting=false;this.changed(false);
    let decoded;
    try{
      decoded=await this.decode(file);if(token!==this.token){MapEditorReference.releaseImages(decoded);return}
      const asset={version:1,name:String(file.name||"参考底图").slice(0,200),blob:file,width:decoded.width,height:decoded.height},placement=MapEditorReference.normalize({},this.grid(),asset);
      if(this.store)await this.enqueue(()=>this.store.transact("readwrite",store=>{store.put(asset,`${key}:image`);return store.put(placement,`${key}:placement`)}));
      if(token!==this.token){MapEditorReference.releaseImages(decoded);return}
      this.release();this.asset=asset;this.image=decoded.image;this.preview=decoded.preview||null;this.placement=placement;decoded=null;
      this.output(this.store?"底图已添加。点击「调整底图」可移动和缩放。":"底图已添加，仅在当前页面保留。");
    }catch{MapEditorReference.releaseImages(decoded);throw new Error(decoded?"底图未替换：浏览器无法保存图片。":"底图未替换：无法读取图片，请检查格式、尺寸或文件是否损坏。")}
    finally{if(token===this.token){this.loading=false;this.changed(false)}}
  }
  async remove(){
    if(this.loading||!this.asset)return;this.beforeAdjust();this.endDrag();await this.flush();const key=this.key,token=++this.token;this.loading=true;this.changed(false);
    try{
      if(this.store)await this.enqueue(()=>this.store.transact("readwrite",store=>{store.delete(`${key}:image`);return store.delete(`${key}:placement`)}));
      if(token===this.token){this.release();this.output("参考底图已移除，地图数据未改动。")}
    }catch{this.output("底图移除失败，原底图保留。")}
    finally{if(token===this.token){this.loading=false;this.changed(false)}}
  }
  rect(){if(!this.asset||!this.placement)return null;const fit=MapEditorReference.fit(this.grid(),this.asset.width,this.asset.height);return {x:this.placement.x,y:this.placement.y,width:fit.width*this.placement.scale,height:fit.height*this.placement.scale}}
  syncGrid(){const grid=this.grid();if(!this.placement||this.placement.grid.width===grid.width&&this.placement.grid.height===grid.height)return;this.drag=null;this.adjusting=false;this.placement=MapEditorReference.remapPlacement(this.placement,grid,this.asset);this.changed()}
  draw(ctx,cell,view=null){
    if(this.loading||!this.image||!this.placement?.visible)return;
    const r=this.rect(),dpr=view?.dpr||1,width=r.width*cell,height=r.height*cell;
    const image=this.preview&&width*dpr<=this.preview.width&&height*dpr<=this.preview.height?this.preview:this.image;
    const x=r.x*cell,y=r.y*cell,left=Math.max(x,view?.x??x),top=Math.max(y,view?.y??y),right=Math.min(x+width,view?view.x+view.width:x+width),bottom=Math.min(y+height,view?view.y+view.height:y+height);
    if(right<=left||bottom<=top)return;
    ctx.save();ctx.globalAlpha=this.placement.opacity;ctx.imageSmoothingEnabled=width*dpr<image.width;ctx.imageSmoothingQuality="high";
    ctx.drawImage(image,(left-x)/width*image.width,(top-y)/height*image.height,(right-left)/width*image.width,(bottom-top)/height*image.height,(left-(view?.x||0))*dpr,(top-(view?.y||0))*dpr,(right-left)*dpr,(bottom-top)*dpr);ctx.restore();
  }
  setAdjusting(enabled){
    if(enabled&&(!this.image||!this.placement?.visible||this.loading))return;
    if(enabled)this.beforeAdjust();else this.endDrag();this.adjusting=!!enabled;this.changed(false);
  }
  beginDrag(point){if(!this.adjusting||this.loading)return false;this.drag={point:{...point},before:structuredClone(this.placement)};return true}
  moveDrag(point){if(!this.drag)return;this.placement=MapEditorReference.normalize({...this.placement,x:this.drag.before.x+point.x-this.drag.point.x,y:this.drag.before.y+point.y-this.drag.point.y},this.grid(),this.asset);this.changed(false)}
  endDrag(cancel=false){if(!this.drag)return false;if(cancel)this.placement=this.drag.before;this.drag=null;this.changed(!cancel);return true}
  zoomTo(scale,anchor){
    if(!this.placement||!Number.isFinite(scale)||scale<=0||this.loading)return;
    const r=this.rect(),next=Math.max(.1,Math.min(10,scale)),ratio=next/this.placement.scale,point=anchor||{x:r.x+r.width/2,y:r.y+r.height/2};
    this.placement={...this.placement,scale:next,x:point.x-(point.x-r.x)*ratio,y:point.y-(point.y-r.y)*ratio};this.placement=MapEditorReference.normalize(this.placement,this.grid(),this.asset);this.changed();
  }
  reset(){if(!this.asset||this.loading)return;this.endDrag();this.placement=MapEditorReference.normalize({opacity:this.placement.opacity,visible:this.placement.visible},this.grid(),this.asset);this.changed()}
  sync(){
    const $=this.$,loaded=!!this.asset,disabled=!loaded||this.loading;
    const controls=$("mapEditorReferenceControls");if(controls)controls.hidden=!loaded;
    for(const id of ["Adjust","Reset","Remove","Visible","Opacity","Scale","X","Y"]){const element=$(`mapEditorReference${id}`);if(element)element.disabled=disabled}
    const add=$("mapEditorReferenceAdd");if(add){add.disabled=this.loading;add.textContent=loaded?"替换底图":"添加底图"}
    const info=$("mapEditorReferenceInfo");if(info)info.textContent=this.loading?"正在载入底图…":loaded?`${this.asset.name} · ${this.asset.width}×${this.asset.height}`:"未添加底图";
    const adjust=$("mapEditorReferenceAdjust");if(adjust){adjust.disabled=disabled||!this.placement?.visible;adjust.textContent=this.adjusting?"完成调整":"调整底图";adjust.classList.toggle("active",this.adjusting);adjust.setAttribute("aria-pressed",String(this.adjusting))}
    if(!this.placement)return;
    const visible=$("mapEditorReferenceVisible");if(visible)visible.checked=this.placement.visible;
    const values={Opacity:Math.round(this.placement.opacity*100),Scale:Math.round(this.placement.scale*1000)/10,X:Math.round(this.placement.x*100)/100,Y:Math.round(this.placement.y*100)/100};
    for(const [name,value] of Object.entries(values)){const input=$(`mapEditorReference${name}`);if(input)input.value=value}
  }
  bind(){
    const $=this.$,file=$("mapEditorReferenceFile");
    if($("mapEditorReferenceAdd"))$("mapEditorReferenceAdd").onclick=()=>file?.click();
    if(file)file.onchange=async()=>{try{if(file.files?.[0])await this.add(file.files[0])}catch(error){this.output(error.message)}finally{file.value=""}};
    if($("mapEditorReferenceRemove"))$("mapEditorReferenceRemove").onclick=()=>this.remove();
    if($("mapEditorReferenceReset"))$("mapEditorReferenceReset").onclick=()=>this.reset();
    if($("mapEditorReferenceAdjust"))$("mapEditorReferenceAdjust").onclick=()=>this.setAdjusting(!this.adjusting);
    if($("mapEditorReferenceVisible"))$("mapEditorReferenceVisible").onchange=event=>{if(!this.placement)return;this.placement.visible=!!event.target.checked;if(!this.placement.visible)this.setAdjusting(false);this.changed()};
    if($("mapEditorReferenceOpacity"))$("mapEditorReferenceOpacity").oninput=event=>{if(!this.placement)return;const value=Number(event.target.value);if(Number.isFinite(value))this.placement.opacity=Math.max(0,Math.min(1,value/100));this.changed()};
    if($("mapEditorReferenceScale"))$("mapEditorReferenceScale").onchange=event=>{this.zoomTo(Number(event.target.value)/100);this.sync()};
    for(const axis of ["X","Y"]){const input=$(`mapEditorReference${axis}`);if(input)input.onchange=event=>{if(!this.placement)return;const value=Number(event.target.value);if(Number.isFinite(value))this.placement=MapEditorReference.normalize({...this.placement,[axis.toLowerCase()]:value},this.grid(),this.asset);this.changed()}}
  }
};
