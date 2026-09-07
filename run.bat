@echo off
chcp 65001 >nul
cd /d %~dp0

where javac >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 JDK，请先安装 JDK 17 或更高版本。
  pause
  exit /b 1
)

if not exist bin mkdir bin
echo 正在编译...
javac -encoding UTF-8 -d bin src\com\study\Roadmap.java src\com\study\Store.java src\com\study\CheckinApp.java
if errorlevel 1 (
  echo [错误] 编译失败，请检查上面的错误信息。
  pause
  exit /b 1
)

echo 启动中，请稍候... 浏览器将自动打开 http://localhost:8080
java -Dfile.encoding=UTF-8 -cp bin com.study.CheckinApp %*
pause
