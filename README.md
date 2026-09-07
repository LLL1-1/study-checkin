# ☕ Java 学习打卡

一个**零依赖**的本地学习打卡网站：后端用纯 Java（JDK 内置 HttpServer），前端原生 HTML/CSS/JS。
基于《Java 后端开发学习路线规划》制作，5 个阶段 · 28 个学习小分部，每个小分部都能独立打卡。

## ✨ 功能

- **每天打卡**：28 个学习小分部（按 5 个阶段分组）每天各可打卡一次，自动记录
  - 🔥 连续打卡天数、累计打卡天数、最近打卡日期
  - 点击卡片查看**打卡日历**，支持点击日期**补打卡 / 取消**
- **20 周计划进度条**：以"开始日期"推算各阶段截止日期，当前周标记、剩余天数一目了然
  - 逾期未完成的阶段显示 🔴 红色提醒，其下未启动的学习项卡片**变红标"⚠️ 逾期未完成"**
  - 临近截止（3 天内）显示黄色"⏰ N 天内到期"
  - 开始日期可在页面右上角修改，进度自动重算
- **算法练习快速入口**：仪表盘"🧮 算法练习"点击展开 → 力扣 / 牛客 / GitHub 题库一键跳转；"LeetCode 简单题""算法突击"卡片上也带可展开题库入口；用到 GitHub 的地方（Git & GitHub、部署与开源等）都有直达链接
- **数据看板**：今日打卡进度环、近 4 周热力图、每日一条行动建议
- 打卡成功有彩屑 🎉 和随机鼓励语

## 🚀 运行

需要 JDK 17 及以上（本机已装 JDK 25）。

**Windows**：双击 `run.bat`，会自动编译、启动并打开浏览器（http://localhost:8080）

**Git Bash / Linux / macOS**：

```bash
./run.sh          # 加 --no-open 可禁止自动打开浏览器
```

**手动命令行**：

```bash
javac -encoding UTF-8 -d bin src/com/study/*.java
java -cp bin com.study.CheckinApp 8080
```

- 换端口：`java -cp bin com.study.CheckinApp 9090`；端口被占用会自动往后试 10 个
- 停止：在窗口按 `Ctrl+C`

## 📁 数据与备份

- 打卡记录：`data/checkins.csv`（每行 `学习项,日期`，纯文本，可直接备份或手动编辑）
- 开始日期：`data/config.csv`
- 重置全部数据：停止服务后删除 `data` 文件夹即可，下次启动自动重建

## 🗂 目录结构

```
study-checkin/
├─ run.bat / run.sh        一键启动脚本
├─ src/com/study/
│  ├─ CheckinApp.java      HTTP 服务 + API + 静态文件
│  ├─ Roadmap.java         路线图数据（5 阶段 28 项 + 外部链接）
│  └─ Store.java           打卡记录与配置的持久化
├─ public/                 前端（index.html / style.css / app.js / favicon.svg）
└─ data/                   运行时自动生成的打卡数据
```

## 🔌 API 一览（本地）

| 接口 | 说明 |
|---|---|
| `GET /api/data` | 全部数据：阶段/学习项/统计/20 周计划进度 |
| `POST /api/toggle?item=ID&date=yyyy-MM-dd` | 打卡 / 取消 / 补打卡（不允许未来日期） |
| `POST /api/config?startDate=yyyy-MM-dd` | 修改计划开始日期 |
