// 编辑草稿独立于战局存档，避免大型战局耗尽 localStorage 后丢失地图编辑。
window.MapEditorDraftStore=class MapEditorDraftStore{
  constructor({database="sanguo-map-editor",objectStore="drafts",legacyPrefix="sanguo.map-editor.draft."}={}){this.opening=null;this.database=database;this.objectStore=objectStore;this.legacyPrefix=legacyPrefix}
  open(){
    if(!window.indexedDB)return Promise.resolve(null);
    if(!this.opening)this.opening=new Promise((resolve,reject)=>{
      const request=window.indexedDB.open(this.database,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(this.objectStore))request.result.createObjectStore(this.objectStore)};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opening=null};resolve(db)};
      request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error("草稿数据库被其他页面占用"));
    }).catch(error=>{this.opening=null;throw error});
    return this.opening;
  }
  async transact(mode,operation){
    const db=await this.open();if(!db)return null;
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(this.objectStore,mode),request=operation(transaction.objectStore(this.objectStore));
      transaction.oncomplete=()=>resolve(request.result);transaction.onabort=()=>reject(transaction.error||request.error||new Error("草稿写入中断"));transaction.onerror=()=>reject(transaction.error||request.error);
    });
  }
  async get(key){const record=await this.transact("readonly",store=>store.get(key));if(record)return record;const legacy=window.localStorage?.getItem(key);return legacy?JSON.parse(legacy):null}
  async put(key,value){const db=await this.open();if(db){await this.transact("readwrite",store=>store.put(value,key));try{window.localStorage?.removeItem(key)}catch{}}else window.localStorage.setItem(key,JSON.stringify(value))}
  async remove(key){const db=await this.open();window.localStorage?.removeItem(key);if(db)await this.transact("readwrite",store=>store.delete(key))}
  async list(){const db=await this.open();if(!db)return Object.keys(window.localStorage).filter(key=>key.startsWith(this.legacyPrefix)).map(key=>({key,value:JSON.parse(window.localStorage.getItem(key))}));const keys=await this.transact("readonly",store=>store.getAllKeys());return Promise.all(keys.map(async key=>({key,value:await this.get(key)})))}
};
