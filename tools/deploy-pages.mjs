// 发布到 GitHub Pages（gh-pages 分支），依次完成：
//   1. 检查当前在 main、工作区干净、缓存版本与内容一致；默认先跑快测（--full 跑全部，--skip-tests 跳过）。
//   2. 推送 main；在临时工作树中检出 origin/gh-pages，清空后用 build-pages 生成静态文件并提交、推送。
//   3. 以 ours 策略把 gh-pages 合回 main 并推送，保持两分支历史相连。
//   4. 轮询 Pages 构建：直到本次提交构建完成；排队或构建超过 10 分钟未动则重新请求一次构建。
// 用法：node tools/deploy-pages.mjs --message "本次发布说明" [--full|--skip-tests] [--no-wait]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2),flag=name=>args.includes(name),option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null};
const run=(command,list,options={})=>String(execFileSync(command,list,{cwd:root,encoding:"utf8",stdio:options.quiet?"pipe":["ignore","pipe","inherit"],...options})??"").trim();
const git=(...list)=>run("git",list),step=text=>console.log(`\n▶ ${text}`);
const branch=git("rev-parse","--abbrev-ref","HEAD");if(branch!=="main")throw new Error(`请在 main 分支发布（当前 ${branch}）`);
if(git("status","--porcelain"))throw new Error("工作区有未提交的改动，请先提交");
step("检查缓存版本");run(process.execPath,["tools/sync-asset-versions.mjs","--check"],{stdio:"inherit"});
if(!flag("--skip-tests")){step(flag("--full")?"运行全部测试":"运行快测");run(process.execPath,["tools/run-tests.mjs",...(flag("--full")?[]:["--quick"])],{stdio:"inherit"})}
const message=option("--message")||git("log","-1","--format=%s"),repo=option("--repo")||git("remote","get-url","origin").replace(/^.*github\.com[:/]/,"").replace(/\.git$/,"");
step("推送 main");git("push","origin","main");
step("生成并推送 gh-pages");git("fetch","origin","gh-pages");const worktree=fs.mkdtempSync(path.join(os.tmpdir(),"sanguo-pages-"));let deployed=null;
try{git("worktree","add","--detach",worktree,"origin/gh-pages");for(const entry of fs.readdirSync(worktree))if(entry!==".git")fs.rmSync(path.join(worktree,entry),{recursive:true,force:true});run(process.execPath,["tools/build-pages.mjs",worktree],{stdio:"inherit"});
  const pages=(...list)=>run("git",["-C",worktree,...list]);pages("add","-A");if(pages("status","--porcelain")){pages("commit","-q","-m",`Deploy game build: ${message}`);pages("push","origin","HEAD:gh-pages");deployed=pages("rev-parse","HEAD");console.log(`已推送 gh-pages ${deployed.slice(0,7)}`)}else console.log("静态文件无变化，跳过 gh-pages 提交")}
finally{try{git("worktree","remove","--force",worktree)}catch{fs.rmSync(worktree,{recursive:true,force:true});git("worktree","prune")}}
step("合并 gh-pages 历史回 main");git("fetch","origin","gh-pages");try{git("merge-base","--is-ancestor","origin/gh-pages","HEAD");console.log("main 已包含 gh-pages，无需合并")}catch{git("merge","-q","-s","ours","origin/gh-pages","-m",`Merge gh-pages: ${message}`);git("push","origin","main")}
if(!deployed||flag("--no-wait")){console.log("\n发布完成");process.exit(0)}
step("等待 Pages 构建");const api=(...list)=>JSON.parse(run("gh",["api",...list],{quiet:true})),started=Date.now();let retried=false,since=Date.now(),last="";
for(;;){let build;try{build=api(`repos/${repo}/pages/builds/latest`)}catch(error){console.log(`查询失败，稍后重试：${error.message.split("\n")[0]}`)}
  if(build){const state=`${build.status} ${build.commit?.slice(0,7)}`;if(state!==last){console.log(`构建状态：${state}`);last=state;since=Date.now()}
    if(build.commit===deployed&&build.status==="built"){console.log(`\n发布完成：Pages 已构建 ${deployed.slice(0,7)}`);break}
    if(build.commit===deployed&&build.status==="errored")throw new Error(`Pages 构建失败：${build.error?.message||"未知错误"}`);
    if(!retried&&Date.now()-since>10*60e3){console.log("构建超过 10 分钟没有进展，重新请求构建");run("gh",["api","-X","POST",`repos/${repo}/pages/builds`],{quiet:true});retried=true;since=Date.now()}}
  if(Date.now()-started>30*60e3)throw new Error("等待 Pages 构建超过 30 分钟，请到仓库 Settings → Pages 查看");
  await new Promise(resolve=>setTimeout(resolve,10e3))}
