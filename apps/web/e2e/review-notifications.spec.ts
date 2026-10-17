import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function account(page: Page) {
  const username = `review_notice_${Date.now()}`,
    password = "test-only-review-notice";
  const user = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "虚构审核通知作者" },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const prefix = `私有审核-${Date.now()}`;
  const headers = { Authorization: `Bearer ${user.token}` },
    adminHeaders = { Authorization: `Bearer ${admin.token}` };
  async function post(n: string) {
    const result = await page.request.post("/api/v1/posts", {
      headers,
      data: {
        clientKey: randomUUID(),
        subjectId: "demo-noodle",
        title: `${prefix}-${n}`,
        body: "这是审核结果通知的虚构亲身经历，测试资料不涉及真实对象或个人。",
        occurredOn: "2024-01-01",
        issueTypes: ["TASTE"],
        anonymous: true,
        personalExperience: true,
      },
    });
    expect(result.status()).toBe(201);
    return (await result.json()).id as string;
  }
  async function decide(kind: string, id: string, action = "REJECT") {
    const data =
      kind === "MATERIAL"
        ? {
            action,
            reason: `${prefix}私密材料审核说明`,
            privacyChecked: true,
            redactions: [],
            baseVersion: 1,
          }
        : { action, reason: `${prefix}私密审核说明` };
    const endpoint =
      kind === "MATERIAL"
        ? `/api/v1/admin/materials/${id}/decision`
        : `/api/v1/admin/reviews/${kind}/${id}/decision`;
    expect(
      (
        await page.request.post(endpoint, { headers: adminHeaders, data })
      ).status(),
    ).toBe(204);
  }
  async function login() {
    await page.goto("/login");
    await page.getByLabel("登录名", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "发现经历", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "后续追踪", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "我的审核", exact: true }).click();
  }
  return { prefix, headers, post, decide, login };
}

test("pages personal review results, marks old results read and keeps private reasons outside public records", async ({
  page,
  browser,
}) => {
  const f = await account(page);
  for (let n = 1; n <= 13; n++) {
    const id = await f.post(String(n).padStart(2, "0"));
    await f.decide("POST", id, n === 1 ? "APPROVE" : "REJECT");
  }
  await f.login();
  const rows = page.locator(".review-notification-list article");
  await expect(rows).toHaveCount(12);
  await expect(rows.first().locator("h3")).toHaveText(`${f.prefix}-13`);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.locator("h3")).toHaveText(`${f.prefix}-01`);
  await rows.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(rows.locator("small")).toContainText("已读");
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/type=REVIEW/);
  await page.goBack();
  await expect(rows).toHaveCount(12);
  await page.goForward();
  await expect(rows).toHaveCount(1);
  await expect(rows.locator("small")).toContainText("已读");
  await page.getByRole("button", { name: "查看最新审核", exact: true }).click();
  await expect(rows).toHaveCount(12);
  await page.getByRole("button", { name: "公开进展", exact: true }).click();
  await expect(page.locator(".notification-list article")).toHaveCount(0);
  await page.getByRole("button", { name: "我的审核", exact: true }).click();
  await expect(rows).toHaveCount(12);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await rows
    .getByRole("link", { name: "查看相关公开记录", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${f.prefix}-01`, exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    `${f.prefix}私密审核说明`,
  );
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const outsider = await context.newPage();
    await outsider.goto("/login");
    await outsider.getByLabel("登录名", { exact: true }).fill("demo");
    await outsider
      .getByLabel("密码", { exact: true })
      .fill("test-only-demo-2026");
    await outsider.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      outsider.getByRole("heading", { name: "发现经历", exact: true }),
    ).toBeVisible();
    await outsider
      .getByRole("link", { name: "后续追踪", exact: true })
      .first()
      .click();
    const loaded = outsider.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/me/review-notifications?") &&
        response.status() === 200,
    );
    await outsider
      .getByRole("button", { name: "我的审核", exact: true })
      .click();
    await loaded;
    await expect(outsider.locator("body")).not.toContainText(f.prefix);
  } finally {
    await context.close();
  }
});

test("shows all review kinds and recovers failed reads with accessible private notification controls", async ({
  page,
}) => {
  const f = await account(page),
    id = await f.post("亲历");
  await f.decide("POST", id, "APPROVE");
  const update = await (
    await page.request.post(`/api/v1/posts/${id}/updates`, {
      headers: f.headers,
      data: {
        title: `${f.prefix}进展`,
        body: "这是需要审核的虚构后续进展，不涉及真实对象。",
      },
    })
  ).json();
  await f.decide("UPDATE", update.id);
  const revision = await (
    await page.request.post(`/api/v1/posts/${id}/revisions`, {
      headers: f.headers,
      data: {
        baseVersion: 1,
        title: `${f.prefix}修订`,
        body: "这是需要核对的虚构更正正文，不涉及真实对象或个人。",
        occurredOn: "2024-01-01",
        issueTypes: ["TASTE"],
        changeReason: "补充具体的虚构经过",
      },
    })
  ).json();
  await f.decide("REVISION", revision.id);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 40;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const material = await (
    await page.request.post(`/api/v1/posts/${id}/materials`, {
      headers: f.headers,
      multipart: {
        source: `${f.prefix}私密来源`,
        visibility: "REVIEW_ONLY",
        clientKey: randomUUID(),
        file: {
          name: "fiction.png",
          mimeType: "image/png",
          buffer: Buffer.from(png, "base64"),
        },
      },
    })
  ).json();
  await f.decide("MATERIAL", material.id, "APPROVE");
  await f.login();
  const rows = page.locator(".review-notification-list article");
  await expect(rows).toHaveCount(4);
  for (const label of [
    "亲历投稿 · 审核通过",
    "后续进展 · 未通过审核",
    "原文修订 · 未通过审核",
    "图片材料 · 审核通过",
  ])
    await expect(rows.getByText(label, { exact: true })).toBeVisible();
  await expect(
    rows.getByText("对应第 1 版正文", { exact: true }),
  ).toBeVisible();
  await expect(
    rows.getByText("基于第 1 版提交的修订", { exact: true }),
  ).toBeVisible();
  const first = rows.first();
  await page.route(
    "**/api/v1/review-notifications/*/read",
    (route) => route.abort(),
    { times: 1 },
  );
  await first.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.locator("[role=alert]")).toBeVisible();
  await expect(first.locator("small")).toContainText("未读");
  await first.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(first.locator("small")).toContainText("已读");
  await page.route(
    "**/api/v1/me/review-notifications?**",
    (route) => route.abort(),
    { times: 1 },
  );
  await page.getByRole("button", { name: "查看最新审核", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试加载审核通知", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "重试加载审核通知", exact: true })
    .click();
  await expect(rows).toHaveCount(4);
  await page.getByRole("button", { name: "我的审核", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "管理我的记录", exact: true }),
  ).toBeFocused();
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    await rows
      .first()
      .screenshot({ path: `test-results/review-notice-${label}.png` });
  }
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const target of await page
    .getByRole("group", { name: "通知类型" })
    .getByRole("button")
    .all())
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await rows.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await rows
    .first()
    .screenshot({ path: "test-results/review-notice-enlarged.png" });
});
