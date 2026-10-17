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
  for(let i=4;i<=12;i++)await store.write(`save_test_${i}`,{save:{...second,turn:i}});
  const library=await new FileSaveStore(file).read();if(Object.keys(library.slots).length!==11||library.slots.save_test_12.save.turn!==12)throw new Error("多档案未持久化");
  for(const id of ["../bad","__proto__","constructor","save_","0"]){let rejected=false;try{await store.write(id,{save:second})}catch{rejected=true}if(!rejected)throw new Error(`非法编号未被拒绝：${id}`)}
  if(!(await store.remove("save_test_12"))||(await store.remove("save_test_12")))throw new Error("删除档案应只成功一次");const afterRemove=await new FileSaveStore(file).read();if(afterRemove.slots.save_test_12||Object.keys(afterRemove.slots).length!==10)throw new Error("删除未持久化或误删其他档案");
  let removeRejected=false;try{await store.remove("../bad")}catch{removeRejected=true}if(!removeRejected)throw new Error("删除时非法编号未被拒绝");
  console.log("启动器持久存档通过：跨实例读取 / 多档案隔离 / 上一版本备份 / 非法编号拒绝 / 删除档案");
}finally{await fs.rm(directory,{recursive:true,force:true})}
