/** 应用版本号（与 package.json 保持一致；「关于」分区展示用） */
export const APP_VERSION = "0.1.0";

/** 更新日志（最新在上） */
export const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: "0.1.0",
    date: "2026-09-26",
    items: [
      "平台基座：认证体系（注册/登录/访客模式）、平台外壳、6 套主题 × 明暗",
      "任务清单：过滤、搜索、优先级、标签、截止日期、拖拽排序",
      "习惯打卡：连续天数、完成率、当月热力图",
      "总览仪表盘：今日任务/习惯直达操作",
      "博客 / 短链 / 书签 / 问卷 / 工具接入位预留",
    ],
  },
];
