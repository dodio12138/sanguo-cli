// 测试运行器：并行执行 tools/test-*.mjs。
//   node tools/run-tests.mjs           全部测试
//   node tools/run-tests.mjs --quick   日常快测（跳过 tools/test-tiers.json 中的长测）
//   node tools/run-tests.mjs --slow    只跑长测
//   node tools/run-tests.mjs --timing  按本次耗时重写长测名单（单项超过 slow_seconds 秒）
//   node tools/run-tests.mjs 名称片段…  只跑文件名含这些片段的测试
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2),flags=new Set(args.filter(arg=>arg.startsWith("--"))),filters=args.filter(arg=>!arg.startsWith("--"));
const tiersPath=path.join(root,"tools/test-tiers.json"),tiers=fs.existsSync(tiersPath)?JSON.parse(fs.readFileSync(tiersPath,"utf8")):{slow_seconds:8,slow:[]},slow=new Set(tiers.slow||[]);
let files=fs.readdirSync(path.join(root,"tools")).filter(name=>/^test-.*\.mjs$/.test(name)).sort();
if(flags.has("--quick"))files=files.filter(name=>!slow.has(name));
if(flags.has("--slow"))files=files.filter(name=>slow.has(name));
if(filters.length)files=files.filter(name=>filters.some(part=>name.includes(part)));
const limit=Math.max(1,Number(process.env.TEST_JOBS)||Math.max(1,os.cpus().length-1)),results=[],started=Date.now();
const run=file=>new Promise(resolve=>{const begin=Date.now(),child=spawn(process.execPath,[path.join("tools",file)],{cwd:root,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);child.on("close",code=>{const seconds=(Date.now()-begin)/1000,result={file,code,seconds,output};results.push(result);process.stdout.write(`${code===0?"通过":"失败"} ${file} ${seconds.toFixed(1)}s\n`);resolve(result)})});
const queue=[...files];await Promise.all(Array.from({length:Math.min(limit,queue.length)},async()=>{while(queue.length)await run(queue.shift())}));
const failed=results.filter(result=>result.code!==0);
for(const result of failed)console.log(`\n—— ${result.file} ——\n${result.output.split("\n").filter(line=>!/ExperimentalWarning|--localstorage-file|trace-warnings/.test(line)).slice(-25).join("\n")}`);
if(flags.has("--timing")&&!filters.length&&!flags.has("--quick")&&!flags.has("--slow")){tiers.slow=results.filter(result=>result.seconds>(tiers.slow_seconds||8)).map(result=>result.file).sort();fs.writeFileSync(tiersPath,JSON.stringify(tiers,null,2)+"\n");console.log(`已更新长测名单：${tiers.slow.length} 项`)}
console.log(`\n${results.length-failed.length}/${results.length} 通过 · 并行 ${limit} · 共 ${((Date.now()-started)/1000).toFixed(1)}s${failed.length?` · 失败：${failed.map(result=>result.file).join("、")}`:""}`);
process.exit(failed.length?1:0);
