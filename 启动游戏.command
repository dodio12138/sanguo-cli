#!/bin/zsh
cd -- "$(dirname -- "$0")"
node tools/start-game.mjs
status=$?
if [[ $status -ne 0 ]]; then
  echo "启动失败（退出码 $status）。按回车关闭窗口。"
  read
fi
