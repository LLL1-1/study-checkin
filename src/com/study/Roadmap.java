package com.study;

import java.util.ArrayList;
import java.util.List;

/**
 * 学习路线图静态数据：5 个阶段，每个阶段包含若干可打卡的"小分部"。
 * 内容来自《Java 后端开发学习路线规划》。
 */
public final class Roadmap {

    public record Link(String label, String url) {}

    public record Item(String id, String name, String detail, String badge, List<Link> links) {}

    public record Stage(String id, String name, String weeks, String icon,
                        String color, String goal, List<Item> items) {}

    private static final List<Link> ALGO_LINKS = List.of(
        new Link("力扣 · 题库", "https://leetcode.cn/problemset/"),
        new Link("牛客 · 在线编程", "https://www.nowcoder.com/exam/oj"),
        new Link("GitHub · Java 算法实现", "https://github.com/TheAlgorithms/Java"),
        new Link("GitHub · 高质量题解", "https://github.com/doocs/leetcode"));

    public static final List<Stage> STAGES = List.of(
        new Stage("s1", "Java 基础巩固", "第 1~4 周", "🌱", "#5B8DEF",
            "基础语法熟练，GitHub 有持续提交记录",
            List.of(
                new Item("s1-syntax", "Java 语法与流程控制", "顺序、分支、循环与方法定义，每个知识点独立写代码验证", "基础", List.of()),
                new Item("s1-oop", "面向对象", "封装、继承、多态、接口、内部类", "基础", List.of()),
                new Item("s1-api", "常用 API", "String、StringBuilder、ArrayList 等常用类的使用", "基础", List.of()),
                new Item("s1-game", "综合游戏项目", "完成黑马阶段项目，理解完整程序结构", "项目", List.of()),
                new Item("s1-leetcode", "LeetCode 简单题", "从数组、字符串开始，每天 1 题，坚持到面试", "每日", ALGO_LINKS),
                new Item("s1-git", "Git & GitHub", "基本操作 + 每天 push 代码，保持 GitHub 活跃", "每日",
                    List.of(new Link("GitHub", "https://github.com/"),
                            new Link("GitHub 快速入门", "https://docs.github.com/zh/get-started/start-your-journey/hello-world"))),
                new Item("s1-collection", "集合框架深入", "HashMap、HashSet、LinkedList 原理与使用，课程只讲了 ArrayList", "P1", List.of())
            )),

        new Stage("s2", "数据库 + 网络", "第 5~8 周", "🗄️", "#3FB0D0",
            "能独立设计数据库表，理解网络请求流程",
            List.of(
                new Item("s2-mysql", "MySQL 核心", "SQL、索引、事务、锁、优化，能独立设计表结构", "P7",
                    List.of(new Link("小林 coding · MySQL", "https://xiaolincoding.com/mysql/"))),
                new Item("s2-jdbc", "JDBC", "连接数据库，把阶段项目数据持久化", "穿插", List.of()),
                new Item("s2-redis", "Redis 入门", "缓存概念、5 大基本数据类型", "P11", List.of()),
                new Item("s2-net", "计算机网络", "HTTP、TCP、HTTPS，理解一次网络请求的完整流程", "P8",
                    List.of(new Link("小林 coding · 图解网络", "https://xiaolincoding.com/")))
            )),

        new Stage("s3", "Java 进阶 + 框架", "第 9~12 周", "🚀", "#3FB984",
            "能用 Spring Boot 搭建 RESTful 接口",
            List.of(
                new Item("s3-generics", "异常处理与泛型", "异常体系、自定义异常、泛型上下界与通配符", "P2", List.of()),
                new Item("s3-io", "IO 与 NIO", "字节/字符流、缓冲流、序列化、NIO 通道与缓冲区", "P3", List.of()),
                new Item("s3-concurrent", "多线程与并发", "线程池、锁、volatile、ThreadLocal、并发工具类", "P4", List.of()),
                new Item("s3-jvm", "JVM", "内存区域、类加载机制、GC 基础", "核心", List.of()),
                new Item("s3-reflect", "注解与反射", "元注解、自定义注解、反射调用，Spring 框架的基石", "P5", List.of()),
                new Item("s3-java8", "Java 8 新特性", "Lambda、Stream、Optional、函数式接口", "P6", List.of()),
                new Item("s3-springboot", "Spring Boot", "IoC/DI、注解开发、快速搭建 RESTful 接口", "P10",
                    List.of(new Link("Spring 官方文档", "https://spring.io/projects/spring-boot"))),
                new Item("s3-mybatis", "MyBatis", "ORM 映射、动态 SQL，连接 Spring Boot 与 MySQL", "P10", List.of()),
                new Item("s3-os", "操作系统", "进程/线程、内存、IO 模型，结合并发一起学", "P9", List.of())
            )),

        new Stage("s4", "项目实战", "第 13~16 周", "🛠️", "#F0975B",
            "有一个可展示的完整项目，能讲清技术选型",
            List.of(
                new Item("s4-design", "项目设计与选型", "需求分析、库表设计、技术选型，每一步都能讲清理由", "实战", List.of()),
                new Item("s4-dev", "核心功能开发", "亲手完成完整项目，至少一个功能是自己设计的", "实战", List.of()),
                new Item("s4-middleware", "中间件集成", "项目中集成 MySQL、Redis、MQ（RabbitMQ/Kafka 选一种）", "P12", List.of()),
                new Item("s4-deploy", "部署与开源", "项目部署上线，代码与文档上传 GitHub", "实战",
                    List.of(new Link("GitHub", "https://github.com/")))
            )),

        new Stage("s5", "面试冲刺", "第 17~20 周", "🎯", "#E8798F",
            "拿到实习 offer",
            List.of(
                new Item("s5-questions", "八股文刷题", "JavaGuide、advanced-java 高频面试题过 2~3 轮", "冲刺",
                    List.of(new Link("JavaGuide", "https://javaguide.cn/"),
                            new Link("GitHub · advanced-java", "https://github.com/doocs/advanced-java"))),
                new Item("s5-algo", "算法突击", "高频题型分类刷，配合每日一题保持手感", "P15", ALGO_LINKS),
                new Item("s5-mock", "模拟面试", "自我提问 + AI/同学模拟面试，录音复盘", "冲刺", List.of()),
                new Item("s5-resume", "简历与投递", "打磨简历、投递寒假实习岗位", "冲刺", List.of())
            ))
    );

    public static Item findItem(String id) {
        for (Stage s : STAGES) {
            for (Item i : s.items()) {
                if (i.id().equals(id)) return i;
            }
        }
        return null;
    }

    public static String colorOf(String itemId) {
        for (Stage s : STAGES) {
            for (Item i : s.items()) {
                if (i.id().equals(itemId)) return s.color();
            }
        }
        return "#5B8DEF";
    }

    public static int totalItems() {
        int n = 0;
        for (Stage s : STAGES) n += s.items().size();
        return n;
    }

    public static List<Item> allItems() {
        List<Item> items = new ArrayList<>();
        for (Stage s : STAGES) items.addAll(s.items());
        return items;
    }

    private Roadmap() {}
}
