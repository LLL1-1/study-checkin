'use strict';

/* ============ 全局状态 ============ */
let DATA = null;
let cal = null;
let stageById = {}, itemById = {}, itemStage = {}, colorById = {}, tlStageById = {};
let collapsedStages = new Set();
let userToggled = new Set(); // 记录用户手动操作过的阶段，自动逻辑不再覆盖
const OFFLINE = location.hostname === '' || location.hostname === 'localhost' ? false : true;
const LS_KEY = 'study_checkin_data';
const $ = s => document.querySelector(s);
const RING_C = 326.7;

/* ============ GitHub 后端 ============ */
const GH_OWNER = 'LLL1-1', GH_REPO = 'study-checkin', GH_FILE = 'data/state.json';
let ghToken = localStorage.getItem('gh_token') || '';
let ghReady = false;

function getGhToken() { return ghToken; }
function setGhToken(t) { ghToken = t; localStorage.setItem('gh_token', t); }
function clearGhToken() { ghToken = ''; localStorage.removeItem('gh_token'); }

async function ghRead() {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (ghToken) headers['Authorization'] = 'token ' + ghToken;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error('GitHub read failed: ' + r.status);
  const j = await r.json();
  const content = atob(j.content.replace(/\n/g, ''));
  return { state: JSON.parse(content), sha: j.sha };
}

async function ghWrite(state, sha, msg) {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;
  const body = { message: msg, content: btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2)))), sha };
  if (ghToken) body.branch = 'main';
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'token ' + ghToken },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.status); }
  return (await r.json()).content.sha;
}

async function ghLoad() {
  if (!ghToken) return null;
  try {
    const { state, sha } = await ghRead();
    ghReady = true;
    localStorage.setItem('gh_sha', sha);
    return state;
  } catch (e) {
    console.warn('[GitHub] 读取失败:', e.message);
    if (e.message.includes('401') || e.message.includes('403')) {
      toast('⚠️ Token 无效或已过期，请重新配置'); clearGhToken();
    }
    return null;
  }
}

async function ghSave(state) {
  if (!ghReady || !ghToken) return;
  try {
    const sha = localStorage.getItem('gh_sha') || '';
    const newSha = await ghWrite(state, sha, '📊 更新打卡数据 ' + new Date().toISOString().slice(0, 16));
    localStorage.setItem('gh_sha', newSha);
  } catch (e) {
    console.warn('[GitHub] 保存失败:', e.message);
    toast('⚠️ 数据同步失败: ' + e.message);
  }
}

/* ============ Token 配置弹窗 ============ */
function showTokenModal() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask'; mask.id = 'tokenMask';
  mask.innerHTML = `<div class="modal" style="max-width:440px;padding:24px">
    <h3 style="margin:0 0 12px">🔑 配置 GitHub Token</h3>
    <p style="font-size:13px;color:var(--muted);margin:0 0 12px">
      配置后打卡数据将保存到 GitHub，跨设备同步不丢失。<br>
      <b>生成 Token：</b>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token<br>
      勾选 <code>repo</code> 权限，复制生成的 Token 粘贴到下方。
    </p>
    <input id="tokenInput" type="password" placeholder="ghp_xxxxxxxxxxxx"
      style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box"
      value="${ghToken}">
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button class="io-btn" id="tokenClear" ${!ghToken ? 'style="display:none"' : ''}>清除 Token</button>
      <button class="io-btn" id="tokenCancel">取消</button>
      <button class="io-btn primary" id="tokenSave">保存</button>
    </div>
    <div id="tokenMsg" style="font-size:12px;margin-top:8px;color:var(--green)"></div>
  </div>`;
  document.body.appendChild(mask);
  document.body.style.overflow = 'hidden';
  const close = () => { mask.remove(); document.body.style.overflow = ''; };
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  document.getElementById('tokenCancel').onclick = close;
  document.getElementById('tokenClear').onclick = () => { clearGhToken(); toast('Token 已清除'); close(); load(); };
  document.getElementById('tokenSave').onclick = async () => {
    const v = document.getElementById('tokenInput').value.trim();
    if (!v) { toast('请输入 Token'); return; }
    setGhToken(v);
    document.getElementById('tokenMsg').textContent = '验证中...';
    const state = await ghLoad();
    if (state) {
      document.getElementById('tokenMsg').textContent = '✅ 验证成功，数据已同步！';
      setTimeout(() => { close(); load(); }, 800);
    } else {
      document.getElementById('tokenMsg').textContent = '❌ Token 无效或仓库权限不足';
      document.getElementById('tokenMsg').style.color = '#dc3545';
    }
  };
}

// 内嵌路线图数据（离线模式用）
const STAGES_DATA = [
  {id:"s1",name:"Java 基础巩固",weeks:"第 1~4 周",icon:"🌱",color:"#5B8DEF",goal:"基础语法熟练，GitHub 有持续提交记录",items:[
    {id:"s1-syntax",name:"Java 语法与流程控制",detail:"顺序、分支、循环与方法定义，每个知识点独立写代码验证",badge:"基础",links:[]},
    {id:"s1-oop",name:"面向对象",detail:"封装、继承、多态、接口、内部类",badge:"基础",links:[]},
    {id:"s1-api",name:"常用 API",detail:"String、StringBuilder、ArrayList 等常用类的使用",badge:"基础",links:[]},
    {id:"s1-game",name:"综合游戏项目",detail:"完成黑马阶段项目，理解完整程序结构",badge:"项目",links:[]},
    {id:"s1-leetcode",name:"LeetCode 简单题",detail:"从数组、字符串开始，每天 1 题，坚持到面试",badge:"每日",links:[{label:"力扣 · 题库",url:"https://leetcode.cn/problemset/"},{label:"牛客 · 在线编程",url:"https://www.nowcoder.com/exam/oj"},{label:"GitHub · Java 算法实现",url:"https://github.com/TheAlgorithms/Java"},{label:"GitHub · 高质量题解",url:"https://github.com/doocs/leetcode"}]},
    {id:"s1-git",name:"Git & GitHub",detail:"基本操作 + 每天 push 代码，保持 GitHub 活跃",badge:"每日",links:[{label:"GitHub",url:"https://github.com/"},{label:"GitHub 快速入门",url:"https://docs.github.com/zh/get-started"}]},
    {id:"s1-collection",name:"集合框架深入",detail:"HashMap、HashSet、LinkedList 原理与使用",badge:"P1",links:[]}
  ]},
  {id:"s2",name:"数据库 + 网络",weeks:"第 5~8 周",icon:"🗄️",color:"#3FB0D0",goal:"能独立设计数据库表，理解网络请求流程",items:[
    {id:"s2-mysql",name:"MySQL 核心",detail:"SQL、索引、事务、锁、优化",badge:"P7",links:[{label:"小林 coding · MySQL",url:"https://xiaolincoding.com/mysql/"}]},
    {id:"s2-jdbc",name:"JDBC",detail:"连接数据库，把阶段项目数据持久化",badge:"穿插",links:[]},
    {id:"s2-redis",name:"Redis 入门",detail:"缓存概念、5 大基本数据类型",badge:"P11",links:[]},
    {id:"s2-net",name:"计算机网络",detail:"HTTP、TCP、HTTPS，理解一次网络请求的完整流程",badge:"P8",links:[{label:"小林 coding · 图解网络",url:"https://xiaolincoding.com/"}]}
  ]},
  {id:"s3",name:"Java 进阶 + 框架",weeks:"第 9~12 周",icon:"🚀",color:"#3FB984",goal:"能用 Spring Boot 搭建 RESTful 接口",items:[
    {id:"s3-generics",name:"异常处理与泛型",detail:"异常体系、自定义异常、泛型上下界与通配符",badge:"P2",links:[]},
    {id:"s3-io",name:"IO 与 NIO",detail:"字节/字符流、缓冲流、序列化、NIO",badge:"P3",links:[]},
    {id:"s3-concurrent",name:"多线程与并发",detail:"线程池、锁、volatile、ThreadLocal",badge:"P4",links:[]},
    {id:"s3-jvm",name:"JVM",detail:"内存区域、类加载机制、GC 基础",badge:"核心",links:[]},
    {id:"s3-reflect",name:"注解与反射",detail:"元注解、自定义注解、反射调用",badge:"P5",links:[]},
    {id:"s3-java8",name:"Java 8 新特性",detail:"Lambda、Stream、Optional、函数式接口",badge:"P6",links:[]},
    {id:"s3-springboot",name:"Spring Boot",detail:"IoC/DI、注解开发、快速搭建 RESTful 接口",badge:"P10",links:[{label:"Spring 官方文档",url:"https://spring.io/projects/spring-boot"}]},
    {id:"s3-mybatis",name:"MyBatis",detail:"ORM 映射、动态 SQL",badge:"P10",links:[]},
    {id:"s3-os",name:"操作系统",detail:"进程/线程、内存、IO 模型",badge:"P9",links:[]}
  ]},
  {id:"s4",name:"项目实战",weeks:"第 13~16 周",icon:"🛠️",color:"#F0975B",goal:"有一个可展示的完整项目，能讲清技术选型",items:[
    {id:"s4-design",name:"项目设计与选型",detail:"需求分析、库表设计、技术选型",badge:"实战",links:[]},
    {id:"s4-dev",name:"核心功能开发",detail:"亲手完成完整项目",badge:"实战",links:[]},
    {id:"s4-middleware",name:"中间件集成",detail:"集成 MySQL、Redis、MQ",badge:"P12",links:[]},
    {id:"s4-deploy",name:"部署与开源",detail:"项目部署上线，代码上传 GitHub",badge:"实战",links:[{label:"GitHub",url:"https://github.com/"}]}
  ]},
  {id:"s5",name:"面试冲刺",weeks:"第 17~20 周",icon:"🎯",color:"#E8798F",goal:"拿到实习 offer",items:[
    {id:"s5-questions",name:"八股文刷题",detail:"JavaGuide、advanced-java 高频面试题",badge:"冲刺",links:[{label:"JavaGuide",url:"https://javaguide.cn/"},{label:"GitHub · advanced-java",url:"https://github.com/doocs/advanced-java"}]},
    {id:"s5-algo",name:"算法突击",detail:"高频题型分类刷",badge:"P15",links:[{label:"力扣 · 题库",url:"https://leetcode.cn/problemset/"},{label:"牛客 · 在线编程",url:"https://www.nowcoder.com/exam/oj"},{label:"GitHub · Java 算法实现",url:"https://github.com/TheAlgorithms/Java"},{label:"GitHub · 高质量题解",url:"https://github.com/doocs/leetcode"}]},
    {id:"s5-mock",name:"模拟面试",detail:"自我提问 + AI/同学模拟面试",badge:"冲刺",links:[]},
    {id:"s5-resume",name:"简历与投递",detail:"打磨简历、投递寒假实习岗位",badge:"冲刺",links:[]}
  ]}
];

const QUOTES = [
  '每天代码上传 GitHub，保持活跃，简历加分。',
  '算法从今天开始刷，每天 1 题，坚持到面试。',
  '不要只看视频，每学一个知识点必须独立写代码验证。',
  '项目一定要亲手做，至少有一个功能是自己设计的，能讲清楚。',
  '善用 AI 答疑，但不要依赖，先自己思考。',
  '保持健康，每周运动，避免久坐。'
];
const TOASTS = [
  '打卡成功，又进步了一点 🎉',
  '太棒了，继续保持！💪',
  '打卡 +1，离 offer 更近一步 🚀',
  '干得漂亮，学习使我快乐 📚'
];

/* ============ 工具函数 ============ */
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmtShort = ds => ds ? ds.slice(5).replace('-', '/') : '';
const daysUntil = ds => Math.round((Date.parse(ds) - Date.parse(DATA.today)) / 86400000);

function badgeCls(b) {
  if (b.startsWith('P')) { const n = parseInt(b.slice(1), 10); return n <= 4 ? 'p-high' : n <= 10 ? 'p-mid' : 'p-low'; }
  return { '每日': 'daily', '穿插': 'mix' }[b] || 'plain';
}

/* ============ 数据加载 ============ */
async function load() {
  if (OFFLINE) {
    // GitHub Pages 离线模式：直接用 localStorage
    DATA = buildOfflineData();
  } else {
    try {
      const r = await fetch('/api/data');
      DATA = await r.json();
    } catch (e) {
      DATA = buildOfflineData();
    }
  }
  stageById = {}; itemById = {}; itemStage = {}; colorById = {}; tlStageById = {};
  DATA.stages.forEach(st => {
    stageById[st.id] = st;
    st.items.forEach(i => { itemById[i.id] = i; itemStage[i.id] = st.id; colorById[i.id] = st.color; });
  });
  (DATA.timeline && DATA.timeline.stages || []).forEach(t => tlStageById[t.id] = t);
  render();
}

function buildOfflineData() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = loadFromLS();
  const startDate = saved.startDate || today;
  const checkins = saved.checkins || {};
  const stages = STAGES_DATA.map(st => ({
    ...st,
    items: st.items.map(it => {
      const dates = checkins[it.id] || [];
      const dateSet = new Set(dates);
      const todayDone = dateSet.has(today);
      const total = dates.length;
      // streak
      let streak = 0;
      let d = new Date(today + 'T00:00:00');
      if (!todayDone) d.setDate(d.getDate() - 1);
      while (dateSet.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
      return {
        id: it.id, name: it.name, detail: it.detail, badge: it.badge,
        links: it.links || [],
        stats: { total, streak, last: dates.length ? dates[dates.length - 1] : null, today: todayDone, dates }
      };
    })
  }));
  const totalItems = stages.reduce((a, s) => a + s.items.length, 0);
  const todayDone = stages.reduce((a, s) => a + s.items.filter(i => i.stats.today).length, 0);
  const allDates = new Set();
  let totalRecords = 0;
  stages.forEach(s => s.items.forEach(i => { i.stats.dates.forEach(d => allDates.add(d)); totalRecords += i.stats.total; }));
  let streak = 0;
  { let d = new Date(today + 'T00:00:00');
    if (!allDates.has(today)) d.setDate(d.getDate() - 1);
    while (allDates.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  }
  const daily = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    let count = 0;
    stages.forEach(s => s.items.forEach(it => { if (it.stats.dates.includes(ds)) count++; }));
    daily.push({ date: ds, count });
  }
  // timeline
  const sd = new Date(startDate + 'T00:00:00');
  const ed = new Date(sd); ed.setDate(ed.getDate() + 139);
  const now = new Date(today + 'T00:00:00');
  const elapsed = Math.round((now - sd) / 86400000);
  const weekEnds = [4, 8, 12, 16, 20];
  const tlStages = stages.map((st, idx) => {
    const we = weekEnds[idx]; const ws = we - 3;
    const sBegin = new Date(sd); sBegin.setDate(sBegin.getDate() + (ws - 1) * 7);
    const sDeadline = new Date(sd); sDeadline.setDate(sDeadline.getDate() + we * 7 - 1);
    const done = st.items.filter(i => i.stats.total > 0).length;
    let status = 'upcoming';
    if (done === st.items.length) status = 'done';
    else if (now > sDeadline) status = 'overdue';
    else if (now >= sBegin) status = 'active';
    return { id: st.id, start: sBegin.toISOString().slice(0, 10), deadline: sDeadline.toISOString().slice(0, 10), status, itemsDone: done, itemsTotal: st.items.length };
  });
  return {
    today, stages,
    global: { todayDone, todayTotal: totalItems, totalRecords, activeDays: allDates.size, streak, firstDate: allDates.size ? [...allDates].sort()[0] : null, daily },
    timeline: { start: startDate, end: ed.toISOString().slice(0, 10), elapsedDays: Math.max(0, elapsed), totalDays: 140, currentWeek: Math.max(1, Math.min(20, Math.floor(elapsed / 7) + 1)), remainingDays: Math.max(0, 140 - Math.max(0, elapsed)), stages: tlStages }
  };
}

function saveToLS(data) {
  const checkins = {};
  data.stages.forEach(s => s.items.forEach(i => { if (i.stats.dates.length) checkins[i.id] = i.stats.dates; }));
  localStorage.setItem(LS_KEY, JSON.stringify({ startDate: data.timeline.start, checkins }));
}
function loadFromLS() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}

function buildDataFromState(state) {
  const today = new Date().toISOString().slice(0, 10);
  const checkins = state.checkins || {};
  const startDate = state.startDate || today;
  const stages = STAGES_DATA.map(st => ({
    ...st,
    items: st.items.map(it => {
      const dates = checkins[it.id] || [];
      const dateSet = new Set(dates);
      const todayDone = dateSet.has(today);
      const total = dates.length;
      let streak = 0;
      let d = new Date(today + 'T00:00:00');
      if (!todayDone) d.setDate(d.getDate() - 1);
      while (dateSet.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
      return {
        id: it.id, name: it.name, detail: it.detail, badge: it.badge,
        links: it.links || [],
        stats: { total, streak, last: dates.length ? dates[dates.length - 1] : null, today: todayDone, dates }
      };
    })
  }));
  const totalItems = stages.reduce((a, s) => a + s.items.length, 0);
  const todayDone = stages.reduce((a, s) => a + s.items.filter(i => i.stats.today).length, 0);
  const allDates = new Set();
  let totalRecords = 0;
  stages.forEach(s => s.items.forEach(i => { i.stats.dates.forEach(d => allDates.add(d)); totalRecords += i.stats.total; }));
  let streak = 0;
  { let d = new Date(today + 'T00:00:00');
    if (!allDates.has(today)) d.setDate(d.getDate() - 1);
    while (allDates.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  }
  const daily = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    let count = 0;
    stages.forEach(s => s.items.forEach(it => { if (it.stats.dates.includes(ds)) count++; }));
    daily.push({ date: ds, count });
  }
  const sd = new Date(startDate + 'T00:00:00');
  const ed = new Date(sd); ed.setDate(ed.getDate() + 139);
  const now = new Date(today + 'T00:00:00');
  const elapsed = Math.round((now - sd) / 86400000);
  const weekEnds = [4, 8, 12, 16, 20];
  const tlStages = stages.map((st, idx) => {
    const we = weekEnds[idx]; const ws = we - 3;
    const sBegin = new Date(sd); sBegin.setDate(sBegin.getDate() + (ws - 1) * 7);
    const sDeadline = new Date(sd); sDeadline.setDate(sDeadline.getDate() + we * 7 - 1);
    const done = st.items.filter(i => i.stats.total > 0).length;
    let status = 'upcoming';
    if (done === st.items.length) status = 'done';
    else if (now > sDeadline) status = 'overdue';
    else if (now >= sBegin) status = 'active';
    return { id: st.id, start: sBegin.toISOString().slice(0, 10), deadline: sDeadline.toISOString().slice(0, 10), status, itemsDone: done, itemsTotal: st.items.length };
  });
  return {
    today, stages,
    global: { todayDone, todayTotal: totalItems, totalRecords, activeDays: allDates.size, streak, firstDate: allDates.size ? [...allDates].sort()[0] : null, daily },
    timeline: { start: startDate, end: ed.toISOString().slice(0, 10), elapsedDays: Math.max(0, elapsed), totalDays: 140, currentWeek: Math.max(1, Math.min(20, Math.floor(elapsed / 7) + 1)), remainingDays: Math.max(0, 140 - Math.max(0, elapsed)), stages: tlStages }
  };
}

function buildGhState(data) {
  const checkins = {};
  data.stages.forEach(s => s.items.forEach(i => { if (i.stats.dates.length) checkins[i.id] = [...i.stats.dates]; }));
  return {
    startDate: data.timeline.start,
    checkins,
    sessions: sessionsData.map(s => ({ start: s.start, end: s.end, duration: s.duration }))
  };
}

function render() {
  renderTop();
  renderDash();
  renderTimeline();
  renderStages();
  renderSidebar();
  renderWeekly();
  if (cal && !$('#modalMask').hidden) renderModal();
}

/* ============ 顶栏 + 仪表盘 ============ */
function renderTop() {
  const d = new Date(DATA.today + 'T00:00:00');
  $('#todayLine').textContent = `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日 · 星期${'日一二三四五六'[d.getDay()]}`;
  const h = new Date().getHours();
  const g = h < 6 ? '夜深了，注意休息 🌙' : h < 11 ? '早上好，元气满满 ☀️' : h < 14 ? '中午好，劳逸结合 🍚' : h < 18 ? '下午好，继续加油 ⚡' : '晚上好，今日收尾 🌆';
  $('#greeting').textContent = `${g}，今天也要打卡哦`;
}

function renderDash() {
  const g = DATA.global;
  const pct = Math.min(1, g.todayDone / g.todayTotal);
  $('#ringFg').style.strokeDashoffset = RING_C * (1 - pct);
  $('#ringNum').textContent = g.todayDone;
  $('#ringDen').textContent = `/ ${g.todayTotal}`;
  $('#stStreak').textContent = g.streak;
  $('#stActive').textContent = g.activeDays;
  $('#stTotal').textContent = g.totalRecords;
  $('#stFirst').textContent = g.firstDate ? fmtShort(g.firstDate) : '今天';
  $('#heatmap').innerHTML = g.daily.map(d => {
    const lvl = d.count === 0 ? 0 : Math.max(1, Math.ceil(d.count / g.todayTotal * 4));
    return `<i class="hm lv${lvl}${d.date === DATA.today ? ' today' : ''}" title="${d.date} · 完成 ${d.count} 项"></i>`;
  }).join('');
  const day = Math.floor((Date.parse(DATA.today) - Date.parse(DATA.today.slice(0,4)+'-01-01')) / 86400000);
  $('#dailyQuote').textContent = '💡 ' + QUOTES[day % QUOTES.length];
}

/* ============ 周报统计 ============ */
function renderWeekly() {
  const today = new Date(DATA.today + 'T00:00:00');
  const dow = (today.getDay() + 6) % 7; // 周一=0
  const weekDates = [];
  for (let i = 0; i <= dow; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (dow - i));
    weekDates.push(d.toISOString().slice(0, 10));
  }
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const counts = weekDates.map(d => DATA.global.daily.find(x => x.date === d)?.count || 0);
  const maxC = Math.max(1, ...counts);

  $('#weekBars').innerHTML = weekDates.map((d, i) =>
    `<div class="wb${d === DATA.today ? ' today-bar' : ''}" style="height:${Math.max(2, counts[i]/maxC*100)}%" title="${d}: ${counts[i]} 项"></div>`
  ).join('');
  $('#weekLabels').innerHTML = weekDates.map((d, i) =>
    `<span${d === DATA.today ? ' style="color:var(--blue);font-weight:700"' : ''}>${dayNames[i]}</span>`
  ).join('');
  const total = counts.reduce((a, b) => a + b, 0);
  $('#weekSummary').innerHTML = `本周已打卡 <b>${total}</b> 次 · ${weekDates.length} 天`;
}

/* ============ 20 周计划进度 ============ */
function renderTimeline() {
  const t = DATA.timeline;
  const input = $('#startDateInput');
  if (document.activeElement !== input) input.value = t.start;

  $('#tlBar').innerHTML = DATA.stages.map((st, idx) => {
    const fill = Math.max(0, Math.min(100, (t.elapsedDays - idx * 28) / 28 * 100));
    return `<div class="seg" style="--c:${st.color}" title="${st.name}"><i style="width:${fill}%"></i></div>`;
  }).join('') + (t.elapsedDays > 0 && t.elapsedDays <= t.totalDays ?
    `<div class="tl-marker" style="left:${Math.min(100, t.elapsedDays / t.totalDays * 100)}%"></div>` : '');

  $('#tlStatus').textContent = t.elapsedDays < 0 ? `⏳ 将于 ${t.start} 开始` :
    t.elapsedDays >= t.totalDays ? '🏁 计划周期已结束' : `第 ${t.currentWeek} 周 / ${t.totalDays / 7}`;
  $('#tlMeta').innerHTML = `已进行 <b>${Math.max(0, t.elapsedDays)}</b> 天 · ` +
    (t.remainingDays > 0 ? `剩余 <b>${t.remainingDays}</b> 天 · ` : '') + `目标日期 <b>${t.end}</b>`;

  $('#tlStages').innerHTML = t.stages.map(s => {
    const st = stageById[s.id]; if (!st) return '';
    const dl = { done: '<span class="dl ok">✅ 已完成</span>', active: '<span class="dl run">▶ 进行中</span>',
      upcoming: '<span class="dl wait">⏳ 未开始</span>', overdue: `<span class="dl late">🔴 逾期 ${Math.abs(daysUntil(s.deadline))} 天</span>` }[s.status] || '';
    return `<div class="tl-row ${s.status}"><span class="tl-dot" style="--c:${st.color}"></span><b>${st.name}</b>
      <span class="tl-weeks">${st.weeks}</span><span class="tl-deadline">截止 ${fmtShort(s.deadline)}</span>${dl}
      <span class="tl-items">${s.itemsDone}/${s.itemsTotal} 项已启动</span></div>`;
  }).join('');
}

/* ============ 阶段与打卡项（智能折叠） ============ */
function renderStages() {
  // 自动折叠：只在用户没有手动操作过的阶段上生效
  DATA.stages.forEach(st => {
    const tl = tlStageById[st.id];
    if (!tl) return;
    if (userToggled.has(st.id)) return; // 用户手动操作过，跳过
    // upcoming 默认折叠
    if (tl.status === 'upcoming') {
      if (!collapsedStages.has(st.id)) collapsedStages.add(st.id);
    }
    // 已完成/进行中/逾期的阶段默认展开
    if (tl.status === 'done' || tl.status === 'active' || tl.status === 'overdue') {
      collapsedStages.delete(st.id);
    }
  });

  $('#stages').innerHTML = DATA.stages.map(st => {
    const tl = tlStageById[st.id] || {};
    const doneToday = st.items.filter(i => i.stats.today).length;
    const isCollapsed = collapsedStages.has(st.id);

    let dl = '';
    if (tl.status === 'overdue') dl = `<span class="stage-dl late">🔴 逾期 ${Math.abs(daysUntil(tl.deadline))} 天</span>`;
    else if (tl.status === 'done') dl = `<span class="stage-dl ok">✅ 阶段完成</span>`;
    else if (tl.deadline) dl = `<span class="stage-dl">⏱ 截止 ${fmtShort(tl.deadline)}</span>`;

    return `<section class="stage${isCollapsed ? ' collapsed' : ''}" style="--accent:${st.color}" data-stage="${st.id}">
      <div class="stage-head" data-toggle-stage="${st.id}">
        <div class="stage-left">
          <span class="stage-icon">${st.icon}</span>
          <div><h2>${st.name}<small>${st.weeks}</small></h2><div class="stage-goal">🎯 ${st.goal}</div></div>
        </div>
        <div class="stage-right">
          ${dl}
          <div class="stage-prog"><div class="sp-track"><i style="width:${st.items.length ? doneToday / st.items.length * 100 : 0}%"></i></div><span>今日 ${doneToday}/${st.items.length}</span></div>
          <span class="stage-collapse">▾</span>
        </div>
      </div>
      <div class="items">${st.items.map(itemCard).join('')}</div>
    </section>`;
  }).join('');
}

function itemCard(i) {
  const tl = tlStageById[itemStage[i.id]] || {};
  const never = i.stats.total === 0;
  const isOverdue = tl.status === 'overdue' && never;
  let due = '';
  if (isOverdue) due = '<span class="due-tag late">⚠️ 逾期未完成</span>';
  else if (tl.status === 'active' && never) {
    const d = daysUntil(tl.deadline);
    if (d >= 0 && d <= 3) due = `<span class="due-tag soon">⏰ ${d === 0 ? '今天' : d + ' 天内'}到期</span>`;
  }
  return `<div class="item ${i.stats.today ? 'is-done' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${i.id}">
    <div class="item-top"><span class="badge ${badgeCls(i.badge)}">${i.badge}</span>${i.stats.today ? '<span class="done-mark">✓ 今日完成</span>' : ''}</div>
    <div class="item-name">${i.name}</div>
    <div class="item-detail">${i.detail}</div>
    ${linksHtml(i)}${due}
    <div class="item-meta">
      <span class="fire" title="连续打卡天数">🔥 ${i.stats.streak} 天</span>
      <span title="累计打卡天数">累计 ${i.stats.total} 天</span>
      ${i.stats.last ? `<span>最近 ${fmtShort(i.stats.last)}</span>` : ''}
    </div>
    <button class="check-btn ${i.stats.today ? 'done' : ''}">${i.stats.today ? '✓ 已打卡' : '打　卡'}</button>
  </div>`;
}

function linksHtml(i) {
  if (!i.links || !i.links.length) return '';
  const chips = i.links.map(l => `<a class="link-chip" href="${l.url}" target="_blank" rel="noopener">🔗 ${l.label}</a>`).join('');
  if (i.links.length >= 3) {
    return `<button class="links-toggle" data-toggle-links type="button">📚 题库与资源入口 ▾</button><div class="links-panel" hidden>${chips}</div>`;
  }
  return `<div class="link-row">${chips}</div>`;
}

/* ============ 侧边栏 ============ */
function renderSidebar() {
  const sb = $('#sbBody');
  let html = '';
  html += `<div class="sb-item active" data-sb="dash"><span class="icon">📊</span><span class="label">仪表盘</span></div>`;
  html += `<div class="sb-item" data-sb="timeline"><span class="icon">🗓️</span><span class="label">20 周计划</span></div>`;

  DATA.stages.forEach(st => {
    const tl = tlStageById[st.id] || {};
    const isCollapsed = collapsedStages.has(st.id);
    const isActive = tl.status === 'active' || tl.status === 'overdue';
    html += `<div class="sb-item${isActive ? ' active' : ''}" data-sb-stage="${st.id}">
      <span class="icon">${st.icon}</span><span class="label">${st.name}</span>
      <span class="arrow">▸</span>
    </div>`;
    html += `<div class="sb-group${isCollapsed ? '' : ' open'}" data-sb-group="${st.id}">`;
    st.items.forEach(it => {
      const checked = it.stats.today;
      html += `<div class="sb-child" data-sb-item="${it.id}">${checked ? '✅ ' : '· '}${it.name}</div>`;
    });
    html += `</div>`;
  });

  html += `<div class="sb-item" data-sb="resources"><span class="icon">📚</span><span class="label">推荐资源</span></div>`;
  html += `<div class="sb-item" data-sb="advice"><span class="icon">💡</span><span class="label">行动建议</span></div>`;
  sb.innerHTML = html;
}

/* ============ 打卡操作 ============ */
async function toggleCheck(id, date, x, y) {
  if (OFFLINE || !navigator.onLine) {
    const saved = loadFromLS();
    if (!saved.checkins) saved.checkins = {};
    if (!saved.checkins[id]) saved.checkins[id] = [];
    const idx = saved.checkins[id].indexOf(date);
    const checked = idx < 0;
    if (checked) saved.checkins[id].push(date);
    else saved.checkins[id].splice(idx, 1);
    saved.checkins[id].sort();
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
    if (checked && x != null) confettiAt(x, y);
    await load();
    toast(checked ? `${pick(TOASTS)} 打卡已保存到浏览器` : `已取消 ${date} 的打卡`);
    return;
  }
  try {
    const r = await fetch(`/api/toggle?item=${encodeURIComponent(id)}&date=${date}`, { method: 'POST' });
    const j = await r.json();
    if (!j.ok) { toast(j.msg || '操作失败'); return; }
    if (j.checked && x != null) confettiAt(x, y);
    await load();
    if (j.checked) {
      const it = itemById[id];
      const extra = it && it.stats.streak > 1 ? `已连续 ${it.stats.streak} 天 🔥` : '好的开始 ✨';
      toast(`${pick(TOASTS)} ${extra}`);
    } else { toast(`已取消 ${date} 的打卡`); }
  } catch (e) { toast('网络异常'); }
}

/* ============ 弹窗 ============ */
function openModal(id) {
  cal = { itemId: id, y: +DATA.today.slice(0, 4), m: +DATA.today.slice(5, 7) - 1 };
  $('#modalMask').hidden = false;
  document.body.style.overflow = 'hidden';
  renderModal();
}
function closeModal() { $('#modalMask').hidden = true; document.body.style.overflow = ''; cal = null; }

function renderModal() {
  const it = itemById[cal.itemId]; if (!it) { closeModal(); return; }
  const color = colorById[cal.itemId];
  const todayStr = DATA.today;
  const startDow = (new Date(cal.y, cal.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cal.y, cal.m + 1, 0).getDate();
  const dateSet = new Set(it.stats.dates);
  const isCurrentMonth = cal.y === +todayStr.slice(0, 4) && cal.m === +todayStr.slice(5, 7) - 1;
  let cells = '<span class="cal-cell empty"></span>'.repeat(startDow);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${cal.y}-${String(cal.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cal-cell'];
    if (dateSet.has(ds)) cls.push('done');
    if (ds === todayStr) cls.push('today');
    if (ds > todayStr) cls.push('future');
    cells += `<span class="${cls.join(' ')}" data-date="${ds}">${d}</span>`;
  }
  const recent = [...it.stats.dates].reverse().slice(0, 12);
  $('#modalBox').style.setProperty('--accent', color);
  $('#modalBox').innerHTML = `
    <div class="modal-head"><div><div class="modal-title">${it.name}</div><div class="modal-sub">${it.detail}</div></div>
    <button class="modal-close" id="modalClose" title="关闭">✕</button></div>
    <div class="modal-stats"><span>🔥 连续 <b>${it.stats.streak}</b> 天</span><span>累计 <b>${it.stats.total}</b> 天</span>
    <span>${it.stats.last ? '最近打卡 ' + it.stats.last : '还没打过卡'}</span></div>
    <div class="cal-nav"><button class="cal-arrow" data-nav="-1" title="上个月">‹</button>
    <b>${cal.y} 年 ${cal.m+1} 月</b><button class="cal-arrow" data-nav="1" ${isCurrentMonth ? 'disabled' : ''} title="下个月">›</button></div>
    <div class="cal-grid">${['一','二','三','四','五','六','日'].map(w => `<span class="cal-wd">${w}</span>`).join('')}${cells}</div>
    <div class="cal-legend">点击日期可 <b>补打卡 / 取消</b>　<i class="lg done"></i> 已打卡　<i class="lg today"></i> 今天</div>
    <div class="modal-recent"><h4>打卡记录（${it.stats.dates.length} 天）</h4>
    ${recent.length ? `<div class="date-chips">${recent.map(d => `<span class="date-chip">${d}</span>`).join('')}</div>` : '<div class="empty-tip">暂无记录，今天就是第一天 ✨</div>'}</div>
    ${it.stats.today ? '<div class="undo-row"><button class="undo-btn" id="undoBtn" type="button">取消今日打卡</button></div>' : ''}`;
}

function navMonth(dir) {
  let m = cal.m + dir, y = cal.y;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  const nowY = +DATA.today.slice(0, 4), nowM = +DATA.today.slice(5, 7) - 1;
  if (y > nowY || (y === nowY && m > nowM)) return;
  cal.y = y; cal.m = m; renderModal();
}

/* ============ 番茄钟 ============ */
let pomoInterval = null, pomoSeconds = 25 * 60, pomoRunning = false, pomoTotal = 25 * 60;

function pomoTick() {
  pomoSeconds--;
  if (pomoSeconds <= 0) {
    clearInterval(pomoInterval);
    pomoInterval = null; pomoRunning = false;
    $('#pomoTime').textContent = '00:00';
    $('#pomoLabel').textContent = '🎉 时间到！休息一下吧';
    toast('🍅 番茄钟完成！休息 5 分钟再继续');
    return;
  }
  const m = Math.floor(pomoSeconds / 60), s = pomoSeconds % 60;
  $('#pomoTime').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const elapsed = pomoTotal - pomoSeconds;
  $('#pomoLabel').textContent = `已进行 ${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`;
}

/* ============ 彩屑与 Toast ============ */
function confettiAt(x, y) {
  const colors = ['#4a90d9','#22a96a','#e6a817','#dc3545','#7c3aed','#0284c7'];
  for (let k = 0; k < 16; k++) {
    const s = document.createElement('i');
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.random()*180-90)+'px');
    s.style.setProperty('--dy', (Math.random()*-150-30)+'px');
    s.style.setProperty('--r', (Math.random()*540-270)+'deg');
    s.style.setProperty('--c', colors[k % colors.length]);
    $('#confettiLayer').appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2300); }

/* ============ 导出 / 导入 ============ */
function exportData() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `学习打卡备份_${DATA.today}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('📤 备份已下载');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const r = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const j = await r.json();
      if (j.ok) { toast('📥 数据恢复成功'); await load(); }
      else toast(j.msg || '导入失败');
    } catch (e) { toast('文件格式错误'); }
  };
  reader.readAsText(file);
}

/* ============ 事件绑定 ============ */
document.addEventListener('click', e => {
  // 侧边栏：切换阶段展开/折叠
  const sbStage = e.target.closest('[data-sb-stage]');
  if (sbStage) {
    const id = sbStage.dataset.sbStage;
    userToggled.add(id); // 标记用户手动操作
    if (collapsedStages.has(id)) collapsedStages.delete(id); else collapsedStages.add(id);
    renderStages(); renderSidebar();
    const el = document.querySelector(`.stage[data-stage="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // 主区域：点击阶段标题折叠/展开
  const toggleStage = e.target.closest('[data-toggle-stage]');
  if (toggleStage) {
    const id = toggleStage.dataset.toggleStage;
    userToggled.add(id); // 标记用户手动操作
    if (collapsedStages.has(id)) collapsedStages.delete(id); else collapsedStages.add(id);
    renderStages(); renderSidebar();
    return;
  }
  // 侧边栏：点击子项滚动
  const sbItem = e.target.closest('[data-sb-item]');
  if (sbItem) {
    const el = document.querySelector(`.item[data-id="${sbItem.dataset.sbItem}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  // 侧边栏：点击导航项滚动
  const sbNav = e.target.closest('[data-sb]');
  if (sbNav) {
    const target = sbNav.dataset.sb;
    let scrollEl;
    if (target === 'dash') scrollEl = $('.dash');
    else if (target === 'timeline') scrollEl = $('.tl-card');
    else if (target === 'resources') scrollEl = $('.extra');
    else if (target === 'advice') scrollEl = $('.advice-list');
    if (scrollEl) scrollEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  // 算法练习面板
  if (e.target.closest('#algoToggle')) {
    const p = $('#algoPanel'); p.hidden = !p.hidden;
    $('#algoToggle').textContent = p.hidden ? '🧮 算法练习 ▾' : '🧮 算法练习 ▴';
    return;
  }
  // 题库展开
  const tgl = e.target.closest('[data-toggle-links]');
  if (tgl) {
    const p = tgl.nextElementSibling; p.hidden = !p.hidden;
    tgl.classList.toggle('open');
    tgl.textContent = tgl.classList.contains('open') ? '📚 收起入口 ▴' : '📚 题库与资源入口 ▾';
    return;
  }
  // 打卡按钮
  const btn = e.target.closest('.check-btn');
  if (btn) {
    const id = btn.closest('.item').dataset.id;
    if (btn.classList.contains('done')) toast('今日已打卡啦～ 如需取消，点卡片看详情 🙂');
    else toggleCheck(id, DATA.today, e.clientX, e.clientY);
    return;
  }
  // 弹窗
  if (e.target.id === 'modalMask' || e.target.closest('#modalClose')) { closeModal(); return; }
  const nav = e.target.closest('.cal-arrow[data-nav]');
  if (nav && !nav.disabled) { navMonth(+nav.dataset.nav); return; }
  const cell = e.target.closest('.cal-cell[data-date]');
  if (cell) { const ds = cell.dataset.date; if (ds > DATA.today) { toast('不能给未来的日期打卡哦 😊'); return; } toggleCheck(cal.itemId, ds); return; }
  const undo = e.target.closest('#undoBtn');
  if (undo) {
    if (undo.classList.contains('armed')) toggleCheck(cal.itemId, DATA.today);
    else { undo.classList.add('armed'); undo.textContent = '再点一次，确认取消'; setTimeout(() => { if (document.body.contains(undo) && undo.classList.contains('armed')) { undo.classList.remove('armed'); undo.textContent = '取消今日打卡'; } }, 2600); }
    return;
  }
  const card = e.target.closest('.item');
  if (card) { openModal(card.dataset.id); return; }
});

// 汉堡按钮
$('#sbToggle').addEventListener('click', () => { $('#sidebar').classList.toggle('show'); });
$('#sbClose').addEventListener('click', () => { $('#sidebar').classList.remove('show'); });

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modalMask').hidden) closeModal(); });

// 开始日期
$('#startDateInput').addEventListener('change', async e => {
  const v = e.target.value; if (!v) return;
  if (OFFLINE || !navigator.onLine) {
    const saved = loadFromLS(); saved.startDate = v;
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
    if (ghReady) await ghSave(buildGhState(DATA));
    toast('开始日期已更新 🗓️' + (ghReady ? ' 已同步到 GitHub' : '')); await load(); return;
  }
  const r = await fetch(`/api/config?startDate=${v}`, { method: 'POST' });
  const j = await r.json();
  if (!j.ok) { toast(j.msg || '保存失败'); return; }
  toast('开始日期已更新 🗓️'); await load();
});

// 番茄钟
document.querySelectorAll('.pomo-btn[data-min]').forEach(btn => {
  btn.addEventListener('click', () => {
    const min = +btn.dataset.min;
    if (pomoRunning) { clearInterval(pomoInterval); pomoRunning = false; }
    pomoTotal = min * 60; pomoSeconds = pomoTotal;
    const m = Math.floor(pomoSeconds / 60), s = pomoSeconds % 60;
    $('#pomoTime').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    $('#pomoLabel').textContent = `已选择 ${min} 分钟`;
    document.querySelectorAll('.pomo-btn[data-min]').forEach(b => b.style.background = '');
    btn.style.background = 'var(--blue-soft)'; btn.style.borderColor = 'var(--blue)'; btn.style.color = 'var(--blue-deep)';
    $('#pomoStart').disabled = false; $('#pomoPause').disabled = true;
  });
});
$('#pomoStart').addEventListener('click', () => {
  if (pomoRunning) return;
  if (pomoSeconds >= pomoTotal) { /* 新开始 */ }
  pomoRunning = true; $('#pomoStart').disabled = true; $('#pomoPause').disabled = false;
  pomoInterval = setInterval(pomoTick, 1000);
});
$('#pomoPause').addEventListener('click', () => {
  if (!pomoRunning) return;
  clearInterval(pomoInterval); pomoInterval = null; pomoRunning = false;
  $('#pomoStart').disabled = false; $('#pomoPause').disabled = true;
  $('#pomoLabel').textContent = '已暂停';
});
$('#pomoReset').addEventListener('click', () => {
  clearInterval(pomoInterval); pomoInterval = null; pomoRunning = false;
  pomoSeconds = pomoTotal;
  const m = Math.floor(pomoTotal / 60);
  $('#pomoTime').textContent = `${String(m).padStart(2,'0')}:00`;
  $('#pomoLabel').textContent = '选择时长后开始';
  $('#pomoStart').disabled = false; $('#pomoPause').disabled = true;
});

// 导出导入
$('#exportBtn').addEventListener('click', exportData);
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

// IntersectionObserver 自动高亮侧边栏
const sbObserver = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      const id = en.target.dataset.navSection;
      if (id) {
        document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
        const el = document.querySelector(`.sb-item[data-sb="${id}"]`);
        if (el) el.classList.add('active');
      }
    }
  });
}, { threshold: 0.3 });

function setupScrollSpy() {
  const sections = [
    { el: $('.dash'), id: 'dash' },
    { el: $('.tl-card'), id: 'timeline' },
    { el: $('.extra'), id: 'resources' }
  ];
  sections.forEach(s => { if (s.el) { s.el.dataset.navSection = s.id; sbObserver.observe(s.el); } });
}

/* ============ 学习计时器（刷新不丢失） ============ */
let timerInterval = null, timerRunning = false, timerStartMs = null;
const TIMER_KEY = 'study_timer_active';
let sessionsData = [], dailyDurations = [];
let chartMonth = new Date(DATA?.today || Date.now());
chartMonth.setDate(1);

function timerTick() {
  const elapsed = Date.now() - timerStartMs;
  const total = Math.floor(elapsed / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  $('#timerDisplay').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// 页面加载时自动恢复计时器
function timerResumeIfActive() {
  const saved = localStorage.getItem(TIMER_KEY);
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.startMs && obj.startMs > 0) {
        timerStartMs = obj.startMs;
        timerRunning = true;
        $('#timerStart').disabled = true;
        $('#timerStop').disabled = false;
        $('#timerLabel').textContent = '学习中（刷新后自动恢复）…';
        timerInterval = setInterval(timerTick, 1000);
        timerTick();
      }
    } catch(e) {}
  }
}

async function timerStart() {
  if (timerRunning) return;
  timerStartMs = Date.now();
  timerRunning = true;
  localStorage.setItem(TIMER_KEY, JSON.stringify({ startMs: timerStartMs }));
  $('#timerStart').disabled = true;
  $('#timerStop').disabled = false;
  $('#timerLabel').textContent = '学习中…';
  timerInterval = setInterval(timerTick, 1000);
}

async function timerStop() {
  if (!timerRunning) return;
  clearInterval(timerInterval);
  timerRunning = false;
  localStorage.removeItem(TIMER_KEY);
  const endMs = Date.now();
  const durationSec = Math.floor((endMs - timerStartMs) / 1000);
  const startIso = new Date(timerStartMs).toISOString().slice(0, 19);
  const endIso = new Date(endMs).toISOString().slice(0, 19);
  if (!OFFLINE) {
    try {
      await fetch('/api/sessions/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: startIso, end: endIso, duration: durationSec })
      });
    } catch(e) {}
  }
  $('#timerStart').disabled = false;
  $('#timerStop').disabled = true;
  $('#timerLabel').textContent = `已记录 ${Math.floor(durationSec/60)} 分 ${durationSec%60} 秒`;
  $('#timerDisplay').textContent = '00:00:00';
  toast(`⏱️ 学习 ${Math.floor(durationSec/60)} 分 ${durationSec%60} 秒已记录`);
  await loadSessions();
  renderCharts();
}

// 页面关闭时自动保存学习时长
window.addEventListener('beforeunload', () => {
  if (timerRunning && timerStartMs) {
    const endMs = Date.now();
    const durationSec = Math.floor((endMs - timerStartMs) / 1000);
    const startIso = new Date(timerStartMs).toISOString().slice(0, 19);
    const endIso = new Date(endMs).toISOString().slice(0, 19);
    if (!OFFLINE) {
      navigator.sendBeacon('/api/sessions/add', new Blob([JSON.stringify({ start: startIso, end: endIso, duration: durationSec })], { type: 'application/json' }));
    }
    localStorage.removeItem(TIMER_KEY);
  }
});

async function loadSessions() {
  try {
    if (!OFFLINE) {
      const r = await fetch('/api/sessions');
      const d = await r.json();
      sessionsData = d.sessions || [];
      dailyDurations = d.daily || [];
    } else if (ghReady && DATA) {
      // 从 GitHub state 中读取 sessions
      const ghState = await ghRead();
      sessionsData = (ghState && ghState.state && ghState.state.sessions) || [];
      // 按天聚合
      const daily = {};
      sessionsData.forEach(s => {
        const day = s.start.slice(0, 10);
        daily[day] = (daily[day] || 0) + s.duration;
      });
      dailyDurations = Object.entries(daily).map(([date, seconds]) => ({ date, seconds }));
    } else {
      sessionsData = []; dailyDurations = [];
    }
  } catch (e) { sessionsData = []; dailyDurations = []; }
  // 计算今日学习总时长
  const today = DATA?.today || new Date().toISOString().slice(0, 10);
  const todaySec = sessionsData.filter(s => s.start.startsWith(today)).reduce((a, b) => a + b.duration, 0);
  const th = Math.floor(todaySec / 3600), tm = Math.floor((todaySec % 3600) / 60);
  if ($('#timerToday')) $('#timerToday').innerHTML = `今日学习: <b>${th}</b> 小时 <b>${tm}</b> 分`;
}

/* ============ 图表渲染 ============ */
function renderCharts() {
  renderBarChart();
  renderLineChart();
}

function renderBarChart() {
  const canvas = $('#barChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  const today = DATA?.today || new Date().toISOString().slice(0, 10);
  const todaySessions = sessionsData.filter(s => s.start.startsWith(today));

  ctx.clearRect(0, 0, W, H);
  const pad = { l: 50, r: 20, t: 20, b: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  if (todaySessions.length === 0) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('今天还没有学习记录，开始学习吧 ✨', W / 2, H / 2);
    if ($('#barSummary')) $('#barSummary').innerHTML = '';
    return;
  }

  const maxDur = Math.max(...todaySessions.map(s => s.duration), 1);
  const barW = Math.min(60, (cw / todaySessions.length) * 0.6);
  const gap = cw / todaySessions.length;

  // 画柱子
  todaySessions.forEach((s, i) => {
    const x = pad.l + i * gap + (gap - barW) / 2;
    const barH = (s.duration / maxDur) * ch;
    const y = pad.t + ch - barH;

    // 渐变
    const grad = ctx.createLinearGradient(x, y, x, pad.t + ch);
    grad.addColorStop(0, '#4a90d9');
    grad.addColorStop(1, '#93c5fd');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // 时长标签
    const mins = Math.round(s.duration / 60);
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(mins + '分', x + barW / 2, y - 6);

    // X轴：开始~结束时间
    const startShort = s.start.slice(11, 16);
    const endShort = s.end.slice(11, 16);
    ctx.fillStyle = '#7b8494'; ctx.font = '10px sans-serif';
    ctx.fillText(startShort, x + barW / 2, pad.t + ch + 14);
    ctx.fillText('→', x + barW / 2, pad.t + ch + 26);
    ctx.fillText(endShort, x + barW / 2, pad.t + ch + 38);
  });

  // Y轴
  ctx.fillStyle = '#7b8494'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const v = Math.round(maxDur * i / ySteps);
    const y = pad.t + ch - (ch * i / ySteps);
    ctx.fillText(v >= 60 ? (v / 60).toFixed(1) + 'h' : v + 's', pad.l - 8, y + 4);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
  }

  const totalMin = todaySessions.reduce((a, b) => a + b.duration, 0) / 60;
  if ($('#barSummary')) $('#barSummary').innerHTML = `今日共 <b>${todaySessions.length}</b> 次学习 · 累计 <b>${Math.floor(totalMin)}</b> 分 <b>${Math.round(totalMin * 60) % 60}</b> 秒`;
}

function renderLineChart() {
  const canvas = $('#lineChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;

  const y = chartMonth.getFullYear(), m = chartMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  if ($('#monthLabel')) $('#monthLabel').textContent = `${y} 年 ${m + 1} 月`;

  const pad = { l: 50, r: 20, t: 20, b: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  // 构建本月每天的时长
  const dayData = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const sec = dailyDurations.find(x => x.date === dateStr)?.seconds || 0;
    dayData.push({ date: dateStr, day: d, seconds: sec });
  }

  const maxSec = Math.max(...dayData.map(d => d.seconds), 1);

  ctx.clearRect(0, 0, W, H);

  // 网格线
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const yy = pad.t + ch - (ch * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + cw, yy); ctx.stroke();
  }

  // Y轴标签
  ctx.fillStyle = '#7b8494'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = Math.round(maxSec * i / 4);
    const yy = pad.t + ch - (ch * i / 4);
    const label = v >= 3600 ? (v / 3600).toFixed(1) + 'h' : v >= 60 ? Math.round(v / 60) + 'm' : v + 's';
    ctx.fillText(label, pad.l - 8, yy + 4);
  }

  if (dayData.every(d => d.seconds === 0)) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('本月还没有学习记录', W / 2, H / 2);
    if ($('#lineSummary')) $('#lineSummary').innerHTML = '';
    return;
  }

  // 面积填充
  ctx.beginPath();
  dayData.forEach((d, i) => {
    const x = pad.l + (i / (daysInMonth - 1 || 1)) * cw;
    const yy = pad.t + ch - (d.seconds / maxSec) * ch;
    if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  });
  ctx.lineTo(pad.l + cw, pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  grad.addColorStop(0, 'rgba(74,144,217,0.25)');
  grad.addColorStop(1, 'rgba(74,144,217,0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // 折线
  ctx.beginPath();
  ctx.strokeStyle = '#4a90d9'; ctx.lineWidth = 2;
  dayData.forEach((d, i) => {
    const x = pad.l + (i / (daysInMonth - 1 || 1)) * cw;
    const yy = pad.t + ch - (d.seconds / maxSec) * ch;
    if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
  });
  ctx.stroke();

  // 数据点 + 日期
  dayData.forEach((d, i) => {
    if (d.seconds === 0) return;
    const x = pad.l + (i / (daysInMonth - 1 || 1)) * cw;
    const yy = pad.t + ch - (d.seconds / maxSec) * ch;
    ctx.beginPath(); ctx.arc(x, yy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4a90d9'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  });

  // X轴刻度（每隔5天标一次）
  ctx.fillStyle = '#7b8494'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  for (let d = 1; d <= daysInMonth; d += 5) {
    const x = pad.l + ((d - 1) / (daysInMonth - 1 || 1)) * cw;
    ctx.fillText(d + '日', x, pad.t + ch + 16);
  }
  // 如果天数少也标每一天
  if (daysInMonth <= 10) {
    ctx.fillStyle = '#7b8494'; ctx.font = '10px sans-serif';
    for (let d = 1; d <= daysInMonth; d++) {
      const x = pad.l + ((d - 1) / (daysInMonth - 1 || 1)) * cw;
      ctx.fillText(d + '日', x, pad.t + ch + 16);
    }
  }

  const totalDaySec = dayData.reduce((a, b) => a + b.seconds, 0);
  const totalH = Math.floor(totalDaySec / 3600), totalM = Math.floor((totalDaySec % 3600) / 60);
  if ($('#lineSummary')) $('#lineSummary').innerHTML = `本月累计学习 <b>${totalH}</b> 小时 <b>${totalM}</b> 分 · 有记录 <b>${dayData.filter(d => d.seconds > 0).length}</b> 天`;
}

/* ============ 学习计时器事件绑定 ============ */
$('#timerStart').addEventListener('click', timerStart);
$('#timerStop').addEventListener('click', timerStop);
$('#monthPrev')?.addEventListener('click', () => { chartMonth.setMonth(chartMonth.getMonth() - 1); renderLineChart(); });
$('#monthNext')?.addEventListener('click', () => { chartMonth.setMonth(chartMonth.getMonth() + 1); renderLineChart(); });
window.addEventListener('resize', () => { if (sessionsData.length) renderCharts(); });

load().then(() => {
  setupScrollSpy();
  loadSessions().then(renderCharts);
  timerResumeIfActive();
});
