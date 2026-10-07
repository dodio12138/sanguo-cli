import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {FileSaveStore} from "../server/save-store.mjs";

const directory=await fs.mkdtemp(path.join(os.tmpdir(),"sanguo-save-store-")),file=path.join(directory,"saves.json"),store=new FileSaveStore(file);
try{
  const first={version:13,savedAt:"2026-09-30T00:00:00.000Z",turn:4},second={version:13,savedAt:"2026-09-30T00:01:00.000Z",turn:5};
  await store.write("1",{save:first,meta:{kind:"manual"}});await store.write("1",{save:second,meta:{kind:"auto"}});await store.write("2",{save:{...second,turn:9},meta:{kind:"manual"}});
  const restored=await new FileSaveStore(file).read();
  if(restored.slots["1"]?.save?.turn!==5||restored.slots["1"]?.backup?.turn!==4||restored.slots["2"]?.save?.turn!==9)throw new Error("跨实例读取、槽位或备份没有持久化");
  let rejected=false;try{await store.write("9",{save:second})}catch{rejected=true}if(!rejected)throw new Error("非法槽位未被拒绝");
  console.log("启动器持久存档通过：跨实例读取 / 三槽隔离 / 上一版本备份 / 非法槽位拒绝");
}finally{await fs.rm(directory,{recursive:true,force:true})}
