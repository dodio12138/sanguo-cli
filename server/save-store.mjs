import fs from "node:fs/promises";
import path from "node:path";

export class FileSaveStore {
  constructor(file){this.file=file;this.pending=Promise.resolve()}
  empty(){return {schemaVersion:1,updatedAt:null,slots:{}}}
  async readFile(){try{const value=JSON.parse(await fs.readFile(this.file,"utf8"));return value&&typeof value==="object"?{...this.empty(),...value,slots:value.slots||{}}:this.empty()}catch(error){if(error.code==="ENOENT")return this.empty();throw new Error(`本地存档文件无法读取：${error.message}`)}}
  async read(){await this.pending;return this.readFile()}
  async write(slot,payload){const id=String(slot);if(!/^[1-3]$/.test(id))throw new Error("存档槽位必须为 1、2 或 3");if(!payload?.save||typeof payload.save!=="object")throw new Error("缺少有效存档内容");this.pending=this.pending.catch(()=>{}).then(async()=>{const state=await this.readFile(),previous=state.slots[id]?.save||state.slots[id]?.backup||null,savedAt=payload.save.savedAt||new Date().toISOString();state.slots[id]={save:payload.save,backup:previous,meta:{...(payload.meta||{}),slot:id,savedAt}};state.updatedAt=savedAt;await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=`${this.file}.tmp-${process.pid}`;await fs.writeFile(temporary,JSON.stringify(state),{mode:0o600});await fs.rename(temporary,this.file);return state.slots[id]});return this.pending}
}
