package com.study;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.awt.Desktop;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.SortedSet;
import java.util.concurrent.Executors;

/**
 * Java 学习打卡 —— 零依赖后端（JDK 内置 HttpServer）。
 * 启动：java -cp bin com.study.CheckinApp [端口] [--no-open]
 */
public class CheckinApp {

    private static final int PLAN_WEEKS = 20;
    private static final int PLAN_DAYS = PLAN_WEEKS * 7;

    private static Store store;
    private static Path publicDir;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("js", "text/javascript; charset=utf-8");
        MIME.put("svg", "image/svg+xml");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("png", "image/png");
        MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain; charset=utf-8");
    }

    public static void main(String[] args) throws IOException {
        boolean open = true;
        int port = 8080;
        for (String a : args) {
            if ("--no-open".equalsIgnoreCase(a)) open = false;
            else {
                try { port = Integer.parseInt(a); } catch (NumberFormatException ignored) {}
            }
        }

        publicDir = Paths.get("public").toAbsolutePath().normalize();
        store = new Store(
                Paths.get("data", "checkins.csv").toAbsolutePath(),
                Paths.get("data", "config.csv").toAbsolutePath(),
                Paths.get("data", "sessions.csv").toAbsolutePath());

        HttpServer server = null;
        int used = port;
        for (int p = port; p < port + 10; p++) {
            try {
                server = HttpServer.create(new InetSocketAddress(p), 0);
                used = p;
                break;
            } catch (IOException e) {
                System.out.println("端口 " + p + " 被占用，尝试下一个…");
            }
        }
        if (server == null) {
            System.err.println("端口 " + port + "~" + (port + 9) + " 都被占用，请关闭占用程序或用参数指定端口。");
            System.exit(1);
        }

        server.createContext("/", CheckinApp::route);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();

        String url = "http://localhost:" + used;
        System.out.println("====================================================");
        System.out.println("  ☕ Java 学习打卡 已启动: " + url);
        System.out.println("  数据目录: " + Paths.get("data").toAbsolutePath());
        System.out.println("  按 Ctrl+C 停止服务");
        System.out.println("====================================================");
        if (open) {
            try {
                Desktop.getDesktop().browse(URI.create(url));
            } catch (Exception ignored) {
                // 无法自动打开浏览器时，手动访问上面的地址即可
            }
        }
    }

    private static void route(HttpExchange ex) {
        String path = ex.getRequestURI().getPath();
        try {
            if (path.equals("/api/data")) {
                sendJson(ex, 200, dataJson());
            } else if (path.equals("/api/toggle")) {
                handleToggle(ex);
            } else if (path.equals("/api/config")) {
                handleConfig(ex);
            } else if (path.equals("/api/export")) {
                handleExport(ex);
            } else if (path.equals("/api/import")) {
                handleImport(ex);
            } else if (path.equals("/api/sessions")) {
                handleSessions(ex);
            } else if (path.equals("/api/sessions/add")) {
                handleSessionAdd(ex);
            } else if (path.startsWith("/api/")) {
                sendJson(ex, 404, "{\"ok\":false,\"msg\":\"接口不存在\"}");
            } else {
                serveStatic(ex, path);
            }
        } catch (Exception e) {
            System.err.println("[500] " + path + " : " + e);
            try {
                sendJson(ex, 500, "{\"ok\":false,\"msg\":\"服务器内部错误\"}");
            } catch (Exception ignored) {}
        } finally {
            ex.close();
        }
    }

    private static void handleToggle(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex);
        String itemId = q.get("item");
        if (itemId == null || Roadmap.findItem(itemId) == null) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"未找到该学习项\"}");
            return;
        }
        LocalDate date = null;
        try {
            date = LocalDate.parse(q.get("date"));
        } catch (Exception ignored) {}
        if (date == null) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"日期格式应为 yyyy-MM-dd\"}");
            return;
        }
        if (date.isAfter(LocalDate.now())) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"不能给未来的日期打卡哦\"}");
            return;
        }
        if (date.isBefore(LocalDate.of(2020, 1, 1))) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"日期太早了\"}");
            return;
        }
        boolean checked = store.toggle(itemId, date);
        System.out.println((checked ? "[打卡] " : "[取消] ") + itemId + " @ " + date);
        sendJson(ex, 200, "{\"ok\":true,\"checked\":" + checked + "}");
    }

    private static void handleConfig(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex);
        LocalDate d = null;
        try {
            d = LocalDate.parse(q.get("startDate"));
        } catch (Exception ignored) {}
        if (d == null) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"开始日期格式应为 yyyy-MM-dd\"}");
            return;
        }
        store.setStartDate(d);
        sendJson(ex, 200, "{\"ok\":true}");
    }

    private static void handleExport(HttpExchange ex) throws IOException {
        String json = store.exportJson();
        sendJson(ex, 200, json);
    }

    private static void handleImport(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        boolean ok = store.importJson(body);
        if (ok) {
            System.out.println("[导入] 数据恢复成功");
            sendJson(ex, 200, "{\"ok\":true}");
        } else {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"数据格式错误或为空\"}");
        }
    }

    private static void handleSessions(HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex);
        String date = q.get("date");
        String sessions;
        if (date != null && !date.isBlank()) {
            try {
                LocalDate d = LocalDate.parse(date);
                sessions = store.sessionsJsonForDate(d);
            } catch (Exception e) {
                sessions = store.sessionsJson();
            }
        } else {
            sessions = store.sessionsJson();
        }
        String daily = store.dailyDurationsJson();
        sendJson(ex, 200, "{\"sessions\":" + sessions + ",\"daily\":" + daily + "}");
    }

    private static void handleSessionAdd(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        // 解析 {"start":"...","end":"...","duration":123}
        try {
            String start = extractJsonStr(body, "start");
            String end = extractJsonStr(body, "end");
            long dur = extractJsonLong(body, "duration");
            if (start == null || end == null || dur <= 0) {
                sendJson(ex, 200, "{\"ok\":false,\"msg\":\"参数不完整\"}");
                return;
            }
            store.addSession(start, end, dur);
            System.out.println("[学习] " + start + " → " + end + " (" + dur + "秒)");
            sendJson(ex, 200, "{\"ok\":true}");
        } catch (Exception e) {
            sendJson(ex, 200, "{\"ok\":false,\"msg\":\"格式错误\"}");
        }
    }

    private static String extractJsonStr(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx < 0) return null;
        int colon = json.indexOf(':', idx);
        int q1 = json.indexOf('"', colon + 1);
        int q2 = json.indexOf('"', q1 + 1);
        return q1 >= 0 && q2 > q1 ? json.substring(q1 + 1, q2) : null;
    }

    private static long extractJsonLong(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx < 0) return -1;
        int colon = json.indexOf(':', idx);
        int end = colon + 1;
        while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) end++;
        return Long.parseLong(json.substring(colon + 1, end).trim());
    }

    /* ==================== 数据组装 ==================== */

    private static String dataJson() {
        LocalDate today = LocalDate.now();
        StringBuilder sb = new StringBuilder(16384);
        sb.append("{\"today\":\"").append(today).append('"');

        sb.append(",\"stages\":[");
        boolean firstStage = true;
        for (Roadmap.Stage st : Roadmap.STAGES) {
            if (!firstStage) sb.append(',');
            firstStage = false;
            sb.append("{\"id\":\"").append(st.id())
              .append("\",\"name\":\"").append(esc(st.name()))
              .append("\",\"weeks\":\"").append(esc(st.weeks()))
              .append("\",\"icon\":\"").append(esc(st.icon()))
              .append("\",\"color\":\"").append(st.color())
              .append("\",\"goal\":\"").append(esc(st.goal()))
              .append("\",\"items\":[");
            boolean firstItem = true;
            for (Roadmap.Item it : st.items()) {
                if (!firstItem) sb.append(',');
                firstItem = false;
                appendItemJson(sb, it, today);
            }
            sb.append("]}");
        }
        sb.append(']');

        Set<LocalDate> all = store.allDates();
        int todayDone = 0;
        for (Roadmap.Item it : Roadmap.allItems()) {
            if (store.datesOf(it.id()).contains(today)) todayDone++;
        }
        sb.append(",\"global\":{\"todayDone\":").append(todayDone)
          .append(",\"todayTotal\":").append(Roadmap.totalItems())
          .append(",\"totalRecords\":").append(store.totalRecords())
          .append(",\"activeDays\":").append(all.size())
          .append(",\"streak\":").append(Store.streakOf(all))
          .append(",\"firstDate\":").append(all.isEmpty() ? "null" : "\"" + Collections.min(all) + "\"")
          .append(",\"daily\":[");
        for (int i = 27; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            if (i < 27) sb.append(',');
            sb.append("{\"date\":\"").append(d).append("\",\"count\":").append(store.countOn(d)).append('}');
        }
        sb.append("]}");

        appendTimelineJson(sb, today);
        sb.append('}');
        return sb.toString();
    }

    private static void appendItemJson(StringBuilder sb, Roadmap.Item it, LocalDate today) {
        SortedSet<LocalDate> dates = store.datesOf(it.id());
        sb.append("{\"id\":\"").append(it.id())
          .append("\",\"name\":\"").append(esc(it.name()))
          .append("\",\"detail\":\"").append(esc(it.detail()))
          .append("\",\"badge\":\"").append(esc(it.badge()))
          .append("\",\"links\":[");
        boolean f = true;
        for (Roadmap.Link l : it.links()) {
            if (!f) sb.append(',');
            f = false;
            sb.append("{\"label\":\"").append(esc(l.label())).append("\",\"url\":\"").append(esc(l.url())).append("\"}");
        }
        sb.append("],\"stats\":{\"total\":").append(dates.size())
          .append(",\"streak\":").append(Store.streakOf(dates))
          .append(",\"last\":").append(dates.isEmpty() ? "null" : "\"" + dates.last() + "\"")
          .append(",\"today\":").append(dates.contains(today))
          .append(",\"dates\":[");
        boolean fd = true;
        for (LocalDate d : dates) {
            if (!fd) sb.append(',');
            fd = false;
            sb.append('"').append(d).append('"');
        }
        sb.append("]}}");
    }

    private static void appendTimelineJson(StringBuilder sb, LocalDate today) {
        LocalDate start = store.getStartDate();
        LocalDate end = start.plusDays(PLAN_DAYS - 1L);
        long elapsed = ChronoUnit.DAYS.between(start, today);

        sb.append(",\"timeline\":{\"start\":\"").append(start)
          .append("\",\"end\":\"").append(end)
          .append("\",\"elapsedDays\":").append(elapsed)
          .append(",\"totalDays\":").append(PLAN_DAYS)
          .append(",\"currentWeek\":").append(Math.max(0, Math.min(PLAN_WEEKS, elapsed / 7 + (elapsed >= 0 ? 1 : 0))))
          .append(",\"remainingDays\":").append(Math.max(0, PLAN_DAYS - Math.max(0, elapsed)))
          .append(",\"stages\":[");
        int[] weekEnds = {4, 8, 12, 16, 20};
        boolean f = true;
        for (int idx = 0; idx < Roadmap.STAGES.size(); idx++) {
            Roadmap.Stage st = Roadmap.STAGES.get(idx);
            int we = weekEnds[idx];
            int ws = we - 3;
            LocalDate sBegin = start.plusDays((ws - 1) * 7L);
            LocalDate sDeadline = start.plusDays(we * 7L - 1L);
            int done = 0;
            for (Roadmap.Item it : st.items()) {
                if (!store.datesOf(it.id()).isEmpty()) done++;
            }
            String status = done == st.items().size() ? "done"
                    : today.isAfter(sDeadline) ? "overdue"
                    : today.isBefore(sBegin) ? "upcoming" : "active";
            if (!f) sb.append(',');
            f = false;
            sb.append("{\"id\":\"").append(st.id())
              .append("\",\"start\":\"").append(sBegin)
              .append("\",\"deadline\":\"").append(sDeadline)
              .append("\",\"status\":\"").append(status)
              .append("\",\"itemsDone\":").append(done)
              .append(",\"itemsTotal\":").append(st.items().size())
              .append('}');
        }
        sb.append("]}");
    }

    /* ==================== 静态文件与工具 ==================== */

    private static void serveStatic(HttpExchange ex, String path) throws IOException {
        if (path.equals("/") || path.endsWith("/")) path = path + "index.html";
        Path file = publicDir.resolve(path.substring(1)).normalize();
        if (!file.startsWith(publicDir) || !Files.isRegularFile(file)) {
            byte[] body = ("<!DOCTYPE html><html lang=\"zh-CN\"><meta charset=\"utf-8\">"
                    + "<title>404</title><body style=\"font-family:sans-serif;text-align:center;padding-top:15vh\">"
                    + "<h1>404 · 页面不存在</h1><p><a href=\"/\">返回学习打卡首页</a></p>").getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            ex.sendResponseHeaders(404, body.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(body); }
            return;
        }
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        byte[] body = Files.readAllBytes(file);
        ex.getResponseHeaders().set("Content-Type", MIME.getOrDefault(ext, "application/octet-stream"));
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.sendResponseHeaders(200, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    private static void sendJson(HttpExchange ex, int code, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(body); }
    }

    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> map = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null || raw.isBlank()) return map;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                map.putIfAbsent(URLDecoder.decode(pair, StandardCharsets.UTF_8), "");
            } else {
                map.put(URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return map;
    }

    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '<' -> sb.append("\\u003c");
                case '>' -> sb.append("\\u003e");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
