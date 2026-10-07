# 九州策 1.0.0 发布说明

这是首个完整可玩版本。游戏可在不连接 AI 的情况下全程手动游玩，也可选择本地 AI 网关提供建议或托管命令。

## 可玩闭环

- 选择 190、200、208 剧本与可玩势力。
- 以十天为一旬下达人事、内政、建设、外交、情报、谋略、军事与行军命令。
- 诸侯独立发展、外交、扩军、野战、围城和灭亡，战役没有强制期限。
- 统一天下或失去全部据点后进入终局。
- 每旬自动保存；主存档损坏时尝试恢复上一份备份。

## AI 可选性

- 纯手动模式不需要模型、密钥或网关。
- AI 辅助模式接受玩家自然语言战略意图，只提供建议。
- AI 托管仍只能向同一命令队列写入命令，不能直接修改游戏世界。
- AI/MCP 获得的城市、军团、战略意图均受游戏内情报等级约束。

## 启动与验收

```bash
python3 -m http.server 8080
node tools/validate-data.mjs
for test_file in tools/test-*.mjs; do node "$test_file" || exit 1; done
node tools/simulate-campaign.mjs --scenario 200_guandu --runs 12 --turns 360
# Safari 开启“允许远程自动化”后：
node tools/qa-ui.mjs
node tools/qa-all-buttons.mjs
```

浏览器访问 `http://127.0.0.1:8080/`。推荐近期版本的 Safari、Chrome、Edge 或 Firefox。

## 已知范围

当前地图以汉末主要战略区的 40×32 网格表达，城市、河流、津渡和关隘按复古地图参考重新排布；战斗在大地图规则层结算。独立战术战场、水战专用地图和更多历史剧本属于 1.0 之后的扩展内容。
