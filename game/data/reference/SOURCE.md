# 人物资料来源

- 来源：`renmu123/koei_san_data` 的 `san11/general.json` 与 `san11/trick.json`
- 上游地址：https://github.com/renmu123/koei_san_data
- 导入工具：`tools/import-koei-san11.mjs`
- 处理方式：保留人物数值、兵种适性、特技与列传；不导入头像资源。
- 上游仓库在本次检查时未提供明确的 LICENSE 文件，因此这些资料仅作为可替换的参考数据层，使用与再发布前应另行确认权利状态。

运行：

```sh
node tools/import-koei-san11.mjs /path/to/koei_san_data/san11 game/data/reference
```
