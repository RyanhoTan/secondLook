import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(page: Page, count = 13) {
  const username = `following_${Date.now()}`,
    password = "test-only-following-2026";
  const user = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "虚构关注管理用户" },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${user.token}` };
  for (let n = 0; n < count; n++) {
    const s = await (
      await page.request.post("/api/v1/subjects", {
        headers,
        data: {
          name: `虚构关注管理对象 ${n} ${Date.now()}`,
          category: "OTHER",
          city: "测试市",
          address: `虚构路 ${n} 号`,
        },
      })
    ).json();
    expect(
      (
        await page.request.put(`/api/v1/subjects/${s.id}/follow`, { headers })
      ).status(),
    ).toBe(204);
    const p = await (
      await page.request.post("/api/v1/posts", {
        headers,
        data: {
          subjectId: s.id,
          clientKey: randomUUID(),
          title: `虚构关注管理经历 ${n}`,
          body: "仅用于验证个人关注管理、分页和取消的虚构记录，不涉及真实个人或商家。",
          occurredOn: "2024-01-01",
          issueTypes: ["INFORMATION"],
          anonymous: true,
          personalExperience: true,
        },
      })
    ).json();
    expect(
      (
        await page.request.post(`/api/v1/admin/reviews/POST/${p.id}/decision`, {
          headers: { Authorization: `Bearer ${admin.token}` },
          data: { action: "APPROVE", reason: "虚构关注管理审核" },
        })
      ).status(),
    ).toBe(204);
    expect(
      (
        await page.request.put(`/api/v1/posts/${p.id}/follow`, { headers })
      ).status(),
    ).toBe(204);
  }
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "我的记录", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: "管理我的关注", exact: true }).click();
  await expect(page.locator(".follow-list article")).toHaveCount(
    Math.min(12, count),
  );
  return { headers };
}

test("manages paginated post/object follows independently and returns from a removed final page", async ({
  page,
}) => {
  const f = await fixture(page);
  await expect(page.locator(".follow-list article")).toHaveCount(12);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".follow-list article")).toHaveCount(1);
  await expect(page).toHaveURL(/target=POST&page=2/);
  await page.getByRole("button", { name: "关注的对象", exact: true }).click();
  await expect(page).toHaveURL(/target=SUBJECT&page=1/);
  await expect(page.locator(".follow-list article")).toHaveCount(12);
  await page.goBack();
  await expect(page.locator(".follow-list article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "关注的帖子", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "取消关注", exact: true }).click();
  await expect(page).toHaveURL(/target=POST&page=1/);
  await expect(page.locator(".follow-list article")).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "关注的对象", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".follow-list article")).toHaveCount(1);
  await page.route("**/subjects/*/follow", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "取消关注", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".follow-list article")).toHaveCount(1);
  await page.unroute("**/subjects/*/follow");
  await page.getByRole("button", { name: "取消关注", exact: true }).click();
  await expect(page).toHaveURL(/target=SUBJECT&page=1/);
  await expect(page.locator(".follow-list article")).toHaveCount(12);
  for (const target of ["POST", "SUBJECT"])
    expect(
      (
        await (
          await page.request.get(`/api/v1/me/follows?target=${target}`, {
            headers: f.headers,
          })
        ).json()
      ).total,
    ).toBe(12);
});

test("following list supports failed loads, invalid links, keyboard, themes and enlarged text", async ({
  page,
}) => {
  await fixture(page, 1);
  await page.route("**/me/follows?*", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "关注的对象", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试查询", exact: true }),
  ).toBeVisible();
  await page.unroute("**/me/follows?*");
  await page.getByRole("button", { name: "重试查询", exact: true }).click();
  await expect(page.locator(".follow-list article")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const cancel = page.getByRole("button", { name: "取消关注", exact: true });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".follow-list article")
      .screenshot({ path: `test-results/following-${label}.png` });
  }
  // Simulate a user opening an invalid route within the running signed-in SPA.
  await page.evaluate(() => {
    history.pushState(null, "", "/following?target=UNKNOWN");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("button", { name: "清除无效条件", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".follow-list article")).toHaveCount(0);
  await page.getByRole("button", { name: "清除无效条件", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "关注的帖子", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".follow-list article")).toHaveCount(1);
});
