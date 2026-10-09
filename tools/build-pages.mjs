import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.resolve(process.argv[2]||path.join(root,".pages-dist"));
if(output===root||root.startsWith(output+path.sep))throw new Error("发布目录不能是项目根目录或其父目录");
await fs.mkdir(output,{recursive:true});
for(const name of ["assets","css","js","game","mods"])await fs.cp(path.join(root,name),path.join(output,name),{recursive:true,filter:source=>!path.basename(source).startsWith(".")});
await fs.mkdir(path.join(output,"docs"),{recursive:true});
await fs.copyFile(path.join(root,"docs/game-turn-map.html"),path.join(output,"docs/game-turn-map.html"));
const html=await fs.readFile(path.join(root,"index.html"),"utf8");
await fs.writeFile(path.join(output,"index.html"),html.replace("<head>",'<head>\n  <script>window.SANGUO_RUNTIME={staticHosting:true};</script>'));
await fs.writeFile(path.join(output,".nojekyll"),"");
console.log(`静态发布文件已生成：${output}`);
