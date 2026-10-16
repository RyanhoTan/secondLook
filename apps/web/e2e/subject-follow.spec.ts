import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(page: Page) {
  const username = `subject_follow_${Date.now()}`,
    password = "test-only-follow-2026";
  const user = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "虚构关注用户" },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${user.token}` },
    adminHeaders = { Authorization: `Bearer ${admin.token}` };
  const subject = await (
    await page.request.post("/api/v1/subjects", {
      headers,
      data: {
        name: `关注测试对象 ${Date.now()}`,
        category: "OTHER",
        city: "测试市",
        address: "虚构路 1 号",
      },
    })
  ).json();
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
  const decide = (kind: string, id: string) =>
    page.request.post(`/api/v1/admin/reviews/${kind}/${id}/decision`, {
      headers: adminHeaders,
      data: { action: "APPROVE", reason: "虚构对象关注审核" },
    });
  const submit = () =>
    page.request.post("/api/v1/posts", {
      headers,
      data: {
        clientKey: randomUUID(),
        subjectId: subject.id,
        title: "虚构关注经历的新记录",
        body: "这是一条虚构的对象关注测试记录，用来验证新公开经历和重要进展的通知。",
        occurredOn: "2024-01-01",
        issueTypes: ["INFORMATION"],
        anonymous: true,
        personalExperience: true,
      },
    });
  await page.getByRole("link", { name: "查找具体对象", exact: true }).click();
  await page.getByLabel("搜索对象名称或门店地址").fill(subject.name);
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await page.locator(`a[href="/subjects/${subject.id}"]`).click();
  return { subject, headers, decide, submit };
}

test("follows an empty object, receives approved events once, and cancels the intended subscription", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(
    page.getByText("这个对象还没有公开经历。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关注此对象", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已关注对象 · 点击取消", exact: true }),
  ).toBeVisible();
  const p = await (await f.submit()).json();
  expect(
    (
      await page.request.get("/api/v1/notifications", { headers: f.headers })
    ).status(),
  ).toBe(200);
  expect(
    await (
      await page.request.get("/api/v1/notifications", { headers: f.headers })
    ).json(),
  ).toHaveLength(0);
  expect((await f.decide("POST", p.id)).status()).toBe(204);
  await page
    .getByRole("link", { name: "后续追踪", exact: true })
    .first()
    .click();
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await expect(page.locator(".notification-list article")).toContainText(
    f.subject.name,
  );
  await page.getByRole("link", { name: /亲历记录公开/ }).click();
  await expect(
    page.getByRole("heading", { name: "虚构关注经历的新记录", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关注后续", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已关注 · 点击取消", exact: true }),
  ).toBeVisible();
  async function progress() {
    const u = await (
      await page.request.post(`/api/v1/posts/${p.id}/updates`, {
        headers: f.headers,
        data: {
          title: "虚构对象后续",
          body: "这是虚构的后续说明，用于验证同一事件只通知一次。",
        },
      })
    ).json();
    expect((await f.decide("UPDATE", u.id)).status()).toBe(204);
  }
  await progress();
  await page
    .getByRole("link", { name: "后续追踪", exact: true })
    .first()
    .click();
  await expect(page.locator(".notification-list article")).toHaveCount(2);
  await page
    .locator(`.notification-list a[href="/posts/${p.id}"]`)
    .first()
    .click();
  await page.locator(`a[href="/subjects/${f.subject.id}"]`).click();
  await page
    .getByRole("button", { name: "已关注对象 · 点击取消", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "关注此对象", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("若仍关注其中的帖子");
  const next = await (await f.submit()).json();
  await f.decide("POST", next.id);
  await progress(); // The separately followed original post still notifies.
  await page
    .getByRole("link", { name: "后续追踪", exact: true })
    .first()
    .click();
  await expect(page.locator(".notification-list article")).toHaveCount(3);
  await page
    .locator(`.notification-list a[href="/posts/${p.id}"]`)
    .first()
    .click();
  await page
    .getByRole("button", { name: "已关注 · 点击取消", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "关注后续", exact: true }),
  ).toBeVisible();
  await progress();
  await page
    .getByRole("link", { name: "后续追踪", exact: true })
    .first()
    .click();
  await expect(page.locator(".notification-list article")).toHaveCount(3);
});

test("object follow provides failure recovery and accessible controls across themes and enlarged text", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.route(`**/subjects/${f.subject.id}/follow`, (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "关注此对象", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关注此对象", exact: true }),
  ).toBeEnabled();
  await page.unroute(`**/subjects/${f.subject.id}/follow`);
  await page.getByRole("button", { name: "关注此对象", exact: true }).click();
  const follow = page.getByRole("button", {
    name: "已关注对象 · 点击取消",
    exact: true,
  });
  await expect(follow).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    await follow.focus();
    await expect(follow).toBeFocused();
    expect((await follow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const headingSize = await page
      .locator(".page-heading h1")
      .evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
    expect(headingSize.scroll).toBeLessThanOrEqual(headingSize.client);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".detail-follow")
      .screenshot({ path: `test-results/subject-follow-${label}.png` });
  }
});
