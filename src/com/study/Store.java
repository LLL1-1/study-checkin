package com.study;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 打卡记录与配置的持久化存储（本地 CSV 文件，线程安全）。
 * data/checkins.csv：每行 "itemId,yyyy-MM-dd"
 * data/config.csv  ：startDate,yyyy-MM-dd（20 周计划的开始日期）
 */
public class Store {

    private final Path dataFile;
    private final Path configFile;
    private final Path sessionsFile;
    private final Map<String, TreeSet<LocalDate>> records = new ConcurrentHashMap<>();
    private volatile LocalDate startDate;

    public Store(Path dataFile, Path configFile) {
        this.dataFile = dataFile;
        this.configFile = configFile;
        this.sessionsFile = null;
        load();
    }

    private void load() {
        LocalDate sd = null;
        try {
            if (Files.exists(configFile)) {
                try (BufferedReader br = Files.newBufferedReader(configFile, StandardCharsets.UTF_8)) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        String[] p = line.split(",", 2);
                        if (p.length == 2 && p[0].trim().equals("startDate")) {
                            sd = LocalDate.parse(p[1].trim());
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[Store] 读取配置失败: " + e.getMessage());
        }
        this.startDate = sd == null ? LocalDate.now() : sd;
        saveConfig();

        try {
            if (Files.exists(dataFile)) {
                try (BufferedReader br = Files.newBufferedReader(dataFile, StandardCharsets.UTF_8)) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        line = line.trim();
                        if (line.isEmpty() || line.startsWith("#")) continue;
                        String[] p = line.split(",");
                        if (p.length >= 2) {
                            try {
                                records.computeIfAbsent(p[0].trim(), k -> new TreeSet<>())
                                       .add(LocalDate.parse(p[1].trim()));
                            } catch (Exception ignored) {
                                // 跳过无法解析的行
                            }
                        }
                    }
                }
            }
        } catch (IOException e) {
            System.err.println("[Store] 读取打卡数据失败: " + e.getMessage());
        }
    }

    private void saveConfig() {
        try {
            Files.createDirectories(configFile.getParent());
            Path tmp = configFile.resolveSibling(configFile.getFileName() + ".tmp");
            try (BufferedWriter w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
                w.write("startDate," + startDate);
                w.newLine();
            }
            moveAtomic(tmp, configFile);
        } catch (IOException e) {
            System.err.println("[Store] 保存配置失败: " + e.getMessage());
        }
    }

    /** 切换某学习项某天的打卡，返回 true 表示现在已打卡（false 表示已取消）。 */
    public synchronized boolean toggle(String itemId, LocalDate date) {
        TreeSet<LocalDate> set = records.computeIfAbsent(itemId, k -> new TreeSet<>());
        boolean removed = set.remove(date);
        if (!removed) set.add(date);
        save();
        return !removed;
    }

    private synchronized void save() {
        try {
            Files.createDirectories(dataFile.getParent());
            Path tmp = dataFile.resolveSibling(dataFile.getFileName() + ".tmp");
            try (BufferedWriter w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
                w.write("# Java 学习打卡记录（学习项,日期），每行一条，可手动备份或编辑");
                w.newLine();
                List<String> ids = new ArrayList<>(records.keySet());
                Collections.sort(ids);
                for (String id : ids) {
                    for (LocalDate d : records.get(id)) {
                        w.write(id + "," + d);
                        w.newLine();
                    }
                }
            }
            moveAtomic(tmp, dataFile);
        } catch (IOException e) {
            System.err.println("[Store] 保存打卡数据失败: " + e.getMessage());
        }
    }

    private static void moveAtomic(Path from, Path to) throws IOException {
        try {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    public SortedSet<LocalDate> datesOf(String itemId) {
        SortedSet<LocalDate> s = records.get(itemId);
        return s == null ? new TreeSet<>() : s;
    }

    public int totalRecords() {
        int n = 0;
        for (Set<LocalDate> s : records.values()) n += s.size();
        return n;
    }

    public Set<LocalDate> allDates() {
        Set<LocalDate> all = new HashSet<>();
        for (Set<LocalDate> s : records.values()) all.addAll(s);
        return all;
    }

    public int countOn(LocalDate d) {
        int c = 0;
        for (Set<LocalDate> s : records.values()) {
            if (s.contains(d)) c++;
        }
        return c;
    }

    /** 连续打卡天数：从今天（若今天未打卡则从昨天）往回连续计数。 */
    public static int streakOf(Set<LocalDate> set) {
        LocalDate d = LocalDate.now();
        if (!set.contains(d)) d = d.minusDays(1);
        int n = 0;
        while (set.contains(d)) {
            n++;
            d = d.minusDays(1);
        }
        return n;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate d) {
        this.startDate = d;
        saveConfig();
    }

    public String exportJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"startDate\":\"").append(startDate).append("\",\"records\":[");
        boolean first = true;
        for (var entry : records.entrySet()) {
            for (LocalDate d : entry.getValue()) {
                if (!first) sb.append(',');
                first = false;
                sb.append("{\"id\":\"").append(entry.getKey()).append("\",\"date\":\"").append(d).append("\"}");
            }
        }
        sb.append("]}");
        return sb.toString();
    }

    public boolean importJson(String json) {
        try {
            if (json == null || json.isBlank()) return false;
            // 解析 startDate
            int sdIdx = json.indexOf("\"startDate\"");
            if (sdIdx >= 0) {
                int colon = json.indexOf(':', sdIdx);
                int q1 = json.indexOf('"', colon + 1);
                int q2 = json.indexOf('"', q1 + 1);
                if (q1 >= 0 && q2 > q1) {
                    this.startDate = LocalDate.parse(json.substring(q1 + 1, q2));
                }
            }
            // 解析 records
            records.clear();
            int recIdx = json.indexOf("\"records\"");
            if (recIdx < 0) return false;
            int arrStart = json.indexOf('[', recIdx);
            int arrEnd = json.lastIndexOf(']');
            if (arrStart < 0 || arrEnd < 0) return false;
            String arr = json.substring(arrStart + 1, arrEnd).trim();
            if (arr.isEmpty()) { save(); saveConfig(); return true; }
            // 逐条解析 {"id":"xxx","date":"yyyy-MM-dd"}
            int pos = 0;
            while (pos < arr.length()) {
                int idIdx = arr.indexOf("\"id\"", pos);
                if (idIdx < 0) break;
                int c1 = arr.indexOf(':', idIdx);
                int q1 = arr.indexOf('"', c1 + 1);
                int q2 = arr.indexOf('"', q1 + 1);
                String id = arr.substring(q1 + 1, q2);
                int dateIdx = arr.indexOf("\"date\"", q2);
                int c2 = arr.indexOf(':', dateIdx);
                int q3 = arr.indexOf('"', c2 + 1);
                int q4 = arr.indexOf('"', q3 + 1);
                LocalDate d = LocalDate.parse(arr.substring(q3 + 1, q4));
                records.computeIfAbsent(id, k -> new TreeSet<>()).add(d);
                pos = q4 + 1;
            }
            save();
            saveConfig();
            return true;
        } catch (Exception e) {
            System.err.println("[Store] 导入失败: " + e.getMessage());
            return false;
        }
    }

    /* ========== 学习会话（sessions.csv）========== */
    // 每行: startTimeIso,endTimeIso,durationSeconds
    private final List<String[]> sessions = new ArrayList<>(); // [startTime, endTime, duration]

    public Store(Path dataFile, Path configFile, Path sessionsFile) {
        this.dataFile = dataFile;
        this.configFile = configFile;
        this.sessionsFile = sessionsFile;
        load();
        if (sessionsFile != null) loadSessions();
    }

    private void loadSessions() {
        if (sessionsFile == null) return;
        try {
            if (Files.exists(sessionsFile)) {
                try (BufferedReader br = Files.newBufferedReader(sessionsFile, StandardCharsets.UTF_8)) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        line = line.trim();
                        if (line.isEmpty() || line.startsWith("#")) continue;
                        String[] p = line.split(",");
                        if (p.length >= 3) sessions.add(new String[]{p[0], p[1], p[2]});
                    }
                }
            }
        } catch (IOException e) {
            System.err.println("[Store] 读取会话数据失败: " + e.getMessage());
        }
    }

    public synchronized void addSession(String start, String end, long durationSec) {
        sessions.add(new String[]{start, end, String.valueOf(durationSec)});
        saveSessions();
    }

    private synchronized void saveSessions() {
        if (sessionsFile == null) return;
        try {
            Files.createDirectories(sessionsFile.getParent());
            Path tmp = sessionsFile.resolveSibling(sessionsFile.getFileName() + ".tmp");
            try (BufferedWriter w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
                w.write("# 学习会话记录: 开始时间,结束时间,时长秒数");
                w.newLine();
                for (String[] s : sessions) {
                    w.write(s[0] + "," + s[1] + "," + s[2]);
                    w.newLine();
                }
            }
            moveAtomic(tmp, sessionsFile);
        } catch (IOException e) {
            System.err.println("[Store] 保存会话数据失败: " + e.getMessage());
        }
    }

    /** 返回所有会话的 JSON 数组 */
    public String sessionsJson() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < sessions.size(); i++) {
            String[] s = sessions.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"start\":\"").append(esc(s[0]))
              .append("\",\"end\":\"").append(esc(s[1]))
              .append("\",\"duration\":").append(s[2]).append('}');
        }
        sb.append(']');
        return sb.toString();
    }

    /** 返回指定日期的会话 JSON 数组 */
    public String sessionsJsonForDate(LocalDate date) {
        String prefix = date + "T";
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (String[] s : sessions) {
            if (s[0].startsWith(prefix)) {
                if (!first) sb.append(',');
                first = false;
                sb.append("{\"start\":\"").append(esc(s[0]))
                  .append("\",\"end\":\"").append(esc(s[1]))
                  .append("\",\"duration\":").append(s[2]).append('}');
            }
        }
        sb.append(']');
        return sb.toString();
    }

    /** 返回所有会话中最早日期到最晚日期范围内，按天聚合的总时长 */
    public String dailyDurationsJson() {
        // key=yyyy-MM-dd, value=totalSeconds
        java.util.Map<String, Long> daily = new java.util.LinkedHashMap<>();
        for (String[] s : sessions) {
            String day = s[0].length() >= 10 ? s[0].substring(0, 10) : "";
            if (!day.isEmpty()) {
                daily.merge(day, Long.parseLong(s[2]), Long::sum);
            }
        }
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (var e : daily.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"date\":\"").append(e.getKey())
              .append("\",\"seconds\":").append(e.getValue()).append('}');
        }
        sb.append(']');
        return sb.toString();
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
