import "dotenv/config";
import { openDatabase } from "./db.js";
import { hashPassword } from "./auth.js";
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const demoPassword = process.env.SEED_DEMO_PASSWORD;
if (
  !adminPassword ||
  adminPassword.length < 8 ||
  !demoPassword ||
  demoPassword.length < 8
)
  throw new Error(
    "请在本地 .env 设置至少 8 位的 SEED_ADMIN_PASSWORD 和 SEED_DEMO_PASSWORD",
  );
const db = openDatabase();
try {
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      nickname: "本地管理员",
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
    },
  });
  const user = await db.user.upsert({
    where: { username: "demo" },
    update: {},
    create: {
      username: "demo",
      nickname: "路过的记录者",
      passwordHash: await hashPassword(demoPassword),
    },
  });
  const examples = [
    {
      id: "demo-noodle",
      name: "示例 · 山间面馆",
      category: "RESTAURANT",
      city: "杭州",
      address: "虚构路 12 号",
      title: "菜单标注与实际收费不一致",
      body: "这是一条虚构演示记录。点单时菜单显示套餐包含饮品，结账时却额外收取了费用。当场询问后，店员表示套餐说明还未更新。希望大家在点单前确认具体收费。",
    },
    {
      id: "demo-company",
      name: "示例 · 远山工作室",
      category: "COMPANY",
      city: "上海",
      address: "虚构园区",
      title: "面试前，建议再次确认岗位职责",
      body: "这是一条虚构演示记录。招聘描述写的是产品设计，现场交流却主要涉及电话销售。来回花费了不少时间，建议面试前把实际工作内容再问清楚。",
    },
    {
      id: "demo-park",
      name: "示例 · 雾屿公园",
      category: "ATTRACTION",
      city: "苏州",
      address: "虚构湖畔",
      title: "部分步道维护中，行前信息不够清楚",
      body: "这是一条虚构演示记录。到现场后才发现主要步道正在维护，预约页面没有明显说明。可以游览的区域比预期少，出发前建议确认开放范围。",
    },
  ];
  for (const [index, example] of examples.entries()) {
    const { title, body, ...subject } = example;
    await db.subject.upsert({
      where: { id: subject.id },
      update: {},
      create: subject,
    });
    const id = `demo-post-${index}`;
    const post = await db.post.upsert({
      where: { id },
      update: {},
      create: {
        id,
        authorId: user.id,
        subjectId: subject.id,
        title,
        body,
        occurredOn: "2026-10-01",
        anonymous: index === 1,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - index * 86400000),
        events: {
          create: {
            title: "亲历记录公开",
            body: "虚构数据，仅用于本地演示。",
            kind: "PUBLISHED",
          },
        },
      },
    });
    await db.postRevision.upsert({
      where: { postId_version: { postId: id, version: 1 } },
      update: {},
      create: {
        postId: id,
        version: 1,
        baseVersion: 1,
        title: post.title,
        body: post.body,
        occurredOn: post.occurredOn,
        occurredPrecision: post.occurredPrecision,
        occurredUntil: post.occurredUntil,
        changeReason: "首次公开",
        status: "PUBLISHED",
        publishedAt: post.publishedAt ?? post.createdAt,
      },
    });
  }
  console.log(
    `虚构演示数据已准备：管理员 ${admin.username}；普通用户 ${user.username}。密码使用本地 .env 配置，不会在日志打印。`,
  );
} finally {
  await db.$disconnect();
}
