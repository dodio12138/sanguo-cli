# 终端三国

一款终端风格的三国策略游戏。选择剧本与势力，治理城池、招揽武将、调遣军队，在群雄割据的时代争夺天下。

## 启动游戏

在线游玩：[<<<三国](https://dodio12138.github.io/sanguo-cli/)。

macOS 下双击项目根目录的 `启动游戏.command`。

也可以在项目目录运行：

```bash
node tools/start-game.mjs
```

游戏无需安装 npm 依赖，启动后会自动打开浏览器。存档保存在浏览器和项目内的 `.local/saves.json`。

## 主要内容

- 190 洛阳、194 濮阳、200 官渡、208 赤壁、211 潼关、219 襄阳六个剧本
- 380 个可操作据点：268 县皆为可驻军的县邑（含119个郡国治所），另有关隘、渡口；565 名人物
- 城市治理、人才任用、军团编制、外交与科技系统
- 行军、补给、野战、围城、俘虏与占领机制
- 不同性格和战略倾向的诸侯 AI
- 手动、AI 辅助、AI 托管和观察者模式
- 数据驱动的事件、剧本与 Mod 支持
- 本地存档，可离线游玩

## 可选 AI

如需使用 AI 军师和史官，将 `.env.example` 复制为 `.env`，填写 `AI_API_KEY` 后重新启动游戏。没有配置 AI 时，完整游戏仍可正常游玩。

详细配置见 [AI 接入说明](docs/AI_API.md)。

## 项目目录

```text
sanguo-cli/
├── index.html          # 游戏入口
├── css/                # 界面样式
├── js/                 # 游戏逻辑与界面
├── game/               # 剧本、地图和规则数据
├── mods/               # Mod 示例与注册表
├── server/             # 本地存档与 AI 网关
├── tools/              # 启动、测试和数据工具
└── docs/               # 开发与扩展文档
```

## 开发与发布

改动脚本、样式或字体后：

```bash
node tools/sync-asset-versions.mjs
```

按文件内容哈希更新 `index.html` 与样式表里的 `?v=` 版本号，不必手工递增。

日常快测，跳过 `tools/test-tiers.json` 中的长测：

```bash
node tools/run-tests.mjs --quick
```

全部测试并行执行；加 `--timing` 会按本次耗时更新长测名单：

```bash
node tools/run-tests.mjs
```

发布到 GitHub Pages：

```bash
node tools/deploy-pages.mjs --message "本次发布说明"
```

发布脚本依次检查版本号、跑快测、推送 main、生成并推送 gh-pages、合回 main，然后等待 Pages 构建完成；构建卡住超过 10 分钟会自动重新请求一次。

`js/core/rule-engine.js` 只保留核心结算，其余按领域拆在 `js/core/engine/`：

- 行军（movement）
- 围城（siege）
- 外交（diplomacy）
- 事件（events）
- 诸侯 AI（ai）
- 行政（administration）

浏览器按 `index.html` 顺序加载这些文件；Node 中引入 `rule-engine.js` 时会自动加载。

## 浏览器支持

建议使用近期版本的 Chrome、Edge、Firefox 或 Safari。
