# 终端三国

一款终端风格的三国策略游戏。选择剧本与势力，治理城池、招揽武将、调遣军队，在群雄割据的时代争夺天下。

## 启动游戏

在线游玩：[<<<三国](https://dodio12138.github.io/sanguo-cli/)。网页版无需安装或配置 AI，存档保存在当前浏览器；清理网站数据会删除存档。通过“帮助 → 高级工具 → 数据与模组工具”导出、导入存档，可在本地版和网页版之间迁移。

macOS 下双击项目根目录的 `启动游戏.command`。

也可以在项目目录运行：

```bash
node tools/start-game.mjs
```

游戏无需安装 npm 依赖，启动后会自动打开浏览器。存档保存在浏览器和项目内的 `.local/saves.json`。

## 主要内容

- 190 反董卓、200 官渡、208 赤壁三个剧本
- 75 个战略据点、253 个县治和 565 名人物
- 城市治理、人才任用、军团编制、外交与科技系统
- 行军、补给、野战、围城、俘虏与占领机制
- 不同性格和战略倾向的诸侯 AI
- 手动、AI 辅助、AI 托管和观察者模式
- 数据驱动的事件、剧本与 Mod 支持
- 本地存档，可离线游玩

## 可选 AI

如需使用 AI 军师和史官，将 `.env.example` 复制为 `.env`，填写 `AI_API_KEY` 后重新启动游戏。没有配置 AI 时，完整游戏仍可正常游玩。

详细配置见 [AI 接入说明](docs/AI_API.md)。

## GitHub Pages 发布

运行 `node tools/build-pages.mjs`，将生成的 `.pages-dist/` 发布到 `gh-pages` 分支根目录。该目录只含游戏静态资源，不包含 `.env`、本地存档或服务器。Pages 选择 `gh-pages` 分支的根目录作为来源；生成的 `.nojekyll` 会关闭 Jekyll 处理。

发布版使用纯浏览器存档并隐藏外部 AI 入口。本地 `node tools/start-game.mjs` 的存档服务和可选 AI 功能仍然可用。

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

## 浏览器支持

建议使用近期版本的 Chrome、Edge、Firefox 或 Safari。
