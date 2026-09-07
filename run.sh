#!/usr/bin/env bash
# Java 学习打卡 · 启动脚本（Git Bash / Linux / macOS）
cd "$(dirname "$0")" || exit 1

if ! command -v javac >/dev/null 2>&1; then
  echo "[错误] 未检测到 JDK，请先安装 JDK 17 或更高版本。"
  exit 1
fi

mkdir -p bin
echo "正在编译..."
javac -encoding UTF-8 -d bin src/com/study/Roadmap.java src/com/study/Store.java src/com/study/CheckinApp.java || exit 1

echo "启动中，请访问 http://localhost:8080"
exec java -Dfile.encoding=UTF-8 -cp bin com.study.CheckinApp "$@"
