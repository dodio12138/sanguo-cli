// Large snapshots belong in IndexedDB; localStorage remains a legacy fallback.
class SaveLibraryStore {
  constructor(){this.records=new Map();this.database=null;this.pending=Promise.resolve()}
  get enabled(){return !!this.database}
  validId(id){return /^(?:[1-9]\d{0,9}|save_[a-zA-Z0-9_-]{1,72})$/.test(String(id))}
  newId(){let id;do{id=`save_${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`}while(this.records.has(id));return id}
  get(id){return this.records.get(String(id))?.save||null}
  backup(id){return this.records.get(String(id))?.backup||null}
  ids(){return [...this.records.keys()]}
  remember(id,save,backup=null){if(!this.validId(id)||!save?.scenarioId)return;const previous=this.records.get(String(id));if(!previous||(Date.parse(save.savedAt)||0)>=(Date.parse(previous.save?.savedAt)||0))this.records.set(String(id),{id:String(id),save,backup:backup||previous?.backup||null})}
  async initialize(){
    // Do not delete or overwrite any legacy slot while discovering the library.
    const ids=new Set(['1','2','3']);try{for(let i=0;i<localStorage.length;i++){const match=localStorage.key(i)?.match(/^sanguo-cli\.slot\.([^.]+)(?:\.backup)?$/);if(match&&this.validId(match[1]))ids.add(match[1])}}catch{}
    for(const id of ids){let save=null,backup=null;try{save=JSON.parse(localStorage.getItem(`sanguo-cli.slot.${id}`)||(id==='1'?localStorage.getItem('sanguo-cli.save.v1'):null))}catch{}try{backup=JSON.parse(localStorage.getItem(`sanguo-cli.slot.${id}.backup`))}catch{}this.remember(id,save||backup,backup)}
    if(!globalThis.indexedDB)return;
    try{
      this.database=await new Promise((resolve,reject)=>{const request=indexedDB.open('sanguo-save-library',1);let settled=false;const timeout=setTimeout(()=>{settled=true;reject(new Error('存档库打开超时'))},3000);request.onupgradeneeded=()=>request.result.createObjectStore('saves',{keyPath:'id'});request.onsuccess=()=>{clearTimeout(timeout);if(settled){request.result.close();return}settled=true;resolve(request.result)};request.onerror=()=>{clearTimeout(timeout);settled=true;reject(request.error)};request.onblocked=()=>{clearTimeout(timeout);settled=true;reject(new Error('存档库被占用'))}});
      this.database.onversionchange=()=>{this.database?.close();this.database=null};
      const records=await new Promise((resolve,reject)=>{const transaction=this.database.transaction('saves','readonly'),request=transaction.objectStore('saves').getAll();let records;request.onsuccess=()=>records=request.result;transaction.oncomplete=()=>resolve(records||[]);transaction.onabort=()=>reject(transaction.error)});
      for(const record of records)this.remember(record.id,record.save,record.backup);
    }catch{this.database?.close();this.database=null}
  }
  put(id,save){
    const recordId=String(id);if(!this.validId(recordId))return Promise.resolve(false);
    // Detach from live game state before the asynchronous transaction starts.
    const snapshot=JSON.parse(JSON.stringify(save)),previous=this.get(recordId),previousBackup=this.backup(recordId);
    this.pending=this.pending.catch(()=>false).then(()=>new Promise(resolve=>{
      if(!this.database){resolve(false);return}
      try{const transaction=this.database.transaction('saves','readwrite'),store=transaction.objectStore('saves'),request=store.get(recordId);let backup;request.onsuccess=()=>{backup=request.result?.save||(previous?.savedAt!==snapshot.savedAt?previous:previousBackup)||null;store.put({id:recordId,save:snapshot,backup})};transaction.oncomplete=()=>{this.remember(recordId,snapshot,backup);resolve(true)};transaction.onabort=()=>resolve(false)}catch{resolve(false)}
    }));return this.pending;
  }
}
window.SaveLibraryStore=SaveLibraryStore;
window.SaveLibrary=new SaveLibraryStore();
