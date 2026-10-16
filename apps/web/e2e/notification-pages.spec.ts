import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(page: Page, count = 13) {
  const username = `np_${Date.now()}`,
    password = "test-only-notification-pages";
  const user = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "虚构通知分页用户" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${user.token}` };
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const adminHeaders = { Authorization: `Bearer ${admin.token}` };
  const post = await (
    await page.request.post("/api/v1/posts", {
      headers,
      data: {
        clientKey: randomUUID(),
        subjectId: "demo-noodle",
        title: "虚构通知分页的测试经历",
        body: "这是专用于测试通知分页与已读恢复的虚构经历，不涉及真实对象或个人。",
        occurredOn: "2024-01-01",
        issueTypes: ["TASTE"],
        anonymous: true,
        personalExperience: true,
      },
    })
  ).json();
  const decide = (kind: string, id: string) =>
    page.request.post(`/api/v1/admin/reviews/${kind}/${id}/decision`, {
      headers: adminHeaders,
      data: { action: "APPROVE", reason: "虚构通知分页审核" },
    });
  expect((await decide("POST", post.id)).status()).toBe(204);
  expect(
    (
      await page.request.put(`/api/v1/posts/${post.id}/follow`, { headers })
    ).status(),
  ).toBe(204);
  async function progress(n: number) {
    const update = await (
      await page.request.post(`/api/v1/posts/${post.id}/updates`, {
        headers,
        data: {
          title: `分页进展 ${String(n).padStart(2, "0")}`,
          body: "这是一条用于分页、已读及查询恢复的虚构重要进展。",
        },
      })
    ).json();
    expect((await decide("UPDATE", update.id)).status()).toBe(204);
  }
  for (let n = 1; n <= count; n++) await progress(n);
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
  await expect(page.locator(".notification-list article")).toHaveCount(
    Math.min(count, 12),
  );
  return { progress };
}

test("pages older notifications, preserves read state and browser history, then returns to newest events", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(
    page.locator(".notification-list article small").first(),
  ).toContainText(String(new Date().getFullYear()));
  await expect(
    page.locator(".notification-list article").first(),
  ).toContainText("分页进展 13");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await expect(page.locator(".notification-list article")).toContainText(
    "分页进展 01",
  );
  await page.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.locator(".notification-list article.read")).toHaveCount(1);
  await expect(
    page.locator(".notification-list article.read small"),
  ).toContainText("· 已读");
  await expect(page).toHaveURL(/page=2/);
  await page.goBack();
  await expect(page.locator(".notification-list article")).toHaveCount(12);
  await page.goForward();
  await expect(page.locator(".notification-list article.read")).toHaveCount(1);
  await f.progress(14);
  await page.getByRole("button", { name: "查看最新进展", exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(
    page.locator(".notification-list article").first(),
  ).toContainText("分页进展 14");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".notification-list article")).toHaveCount(2);
  await expect(page.locator(".notification-list article.read")).toContainText(
    "分页进展 01",
  );
});

test("notification pages recover failed loads and read requests with usable themes, focus and enlarged text", async ({
  page,
}) => {
  await fixture(page, 1);
  await page.route("**/me/notifications?*", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "查看最新进展", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试加载通知", exact: true }),
  ).toBeVisible();
  await page.unroute("**/me/notifications?*");
  await page.getByRole("button", { name: "重试加载通知", exact: true }).click();
  await expect(page.locator(".notification-list article")).toHaveCount(1);
  await page.route("**/notifications/*/read", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".notification-list article.read")).toHaveCount(0);
  await page.unroute("**/notifications/*/read");
  await page.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.locator(".notification-list article.read")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const latest = page.getByRole("button", {
      name: "查看最新进展",
      exact: true,
    });
    await latest.focus();
    await expect(latest).toBeFocused();
    expect((await latest.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".notification-list article")
      .screenshot({ path: `test-results/notification-pages-${label}.png` });
  }
  await page.evaluate(() => {
    history.pushState(null, "", "/notifications?page=bad");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("button", { name: "清除无效条件", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".notification-list article")).toHaveCount(0);
  await page.getByRole("button", { name: "清除无效条件", exact: true }).click();
  await expect(page.locator(".notification-list article.read")).toHaveCount(1);
});
