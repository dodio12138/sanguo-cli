# 九州策数据与 Mod 指南

## 数据校验

正式 Schema 位于 `game/schema/`：

- `game-data.schema.json`：组合后的剧本、地图、势力、城市、人物、军团和规则。
- `save.schema.json`：v10 存档格式。
- `mod-manifest.schema.json`：Mod 清单格式。

在项目根目录执行：

```bash
node tools/validate-data.mjs
```

错误使用 JSON Path 定位，例如 `$.cities[3].force: 未知势力 foo`。

## 创建 Mod

复制 `mods/example-mod/`，修改 `manifest.json` 的 `id`、名称和版本，并在 `mods/registry.json` 注册。ID 只能包含小写字母、数字、下划线和连字符。

补丁会递归覆盖正式数据。多个 Mod 修改同一路径时，后加载者生效，调试台会列出冲突路径及双方 Mod。加载顺序由注册表的 `load_order` 决定。

浏览器调试台的“启用/禁用”会写入本机 `localStorage`，覆盖注册表的启用状态，但不会修改磁盘文件。点击“保存进度并重新载入 Mod”后生效。

## 离线镜像

修改 `game/data/` 后执行：

```bash
node tools/build-offline-data.mjs
```

命令会重建 `js/data/offline-data.generated.js`。该文件用于 `file://` 直接打开模式，不应手工编辑。

## 存档兼容

当前存档版本为 v10。游戏读取 v1—v9 存档时会补齐外交关系网、联军、科技、政策、情报、补给路线、建筑和军团战意字段，再按 v10 载入。调试台可以导出或导入 JSON 存档；导入其他剧本的存档会被拒绝。
