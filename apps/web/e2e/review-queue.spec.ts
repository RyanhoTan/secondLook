import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(page: Page) {
  const prefix = `审核分页-${Date.now()}`;
  const account = await (
    await page.request.post("/api/v1/auth/register", {
      data: {
        username: `rq_${Date.now()}`,
        password: "test-only-review-queue",
        nickname: "虚构审核作者",
      },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const ids: string[] = [];
  for (let i = 1; i <= 13; i++) {
    const response = await page.request.post("/api/v1/posts", {
      headers: { Authorization: `Bearer ${account.token}` },
      data: {
        clientKey: randomUUID(),
        subjectId: "demo-noodle",
        title: `${prefix}-${String(i).padStart(2, "0")}`,
        body: "这是用于审核分页、检索与切换筛选的虚构亲身经历，不涉及真实对象。",
        occurredOn: "2024-01-01",
        issueTypes: ["TASTE"],
        anonymous: true,
        personalExperience: true,
      },
    });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).id);
  }
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("test-only-admin-2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "内容审核" }).click();
  await expect(
    page.locator(".review-search:not(.material-search)"),
  ).toBeVisible();
  await page.getByLabel("搜索待审标题、正文或对象").fill(prefix);
  await page.getByRole("button", { name: "查找待审内容" }).click();
  const queue = page.getByRole("region", { name: "文字审核队列" });
  await expect(queue.locator(".review-item")).toHaveCount(12);
  await expect(
    queue.getByRole("button", { name: "全部文字 · 13", exact: true }),
  ).toBeVisible();
  return {
    prefix,
    queue,
    async cleanup() {
      for (const id of ids) {
        const response = await page.request.post(
          `/api/v1/admin/reviews/POST/${id}/decision`,
          {
            headers: { Authorization: `Bearer ${admin.token}` },
            data: { action: "REJECT", reason: "清理虚构分页测试记录" },
          },
        );
        expect([204, 409]).toContain(response.status());
      }
    },
  };
}

test("searches and pages the oldest text reviews, returning from an emptied last page", async ({
  page,
}) => {
  const f = await fixture(page);
  try {
    await expect(f.queue.locator("h3").first()).toHaveText(`${f.prefix}-01`);
    await f.queue.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(f.queue.locator(".review-item")).toHaveCount(1);
    await expect(f.queue.locator("h3")).toHaveText(`${f.prefix}-13`);
    await page.goBack();
    await expect(f.queue.locator(".review-item")).toHaveCount(12);
    await page.goForward();
    await expect(f.queue.locator(".review-item")).toHaveCount(1);
    await f.queue.getByLabel("审核说明").fill("核对虚构测试正文，暂不予公开");
    await f.queue
      .getByRole("button", { name: "不予公开", exact: true })
      .click();
    await expect(page).toHaveURL(/page=1/);
    await expect(f.queue.locator(".review-item")).toHaveCount(12);
    await expect(
      f.queue.getByRole("button", { name: "全部文字 · 12", exact: true }),
    ).toBeVisible();
    await expect(
      f.queue.getByRole("navigation", { name: "文字审核分页" }),
    ).toHaveCount(0);
    await f.queue
      .getByRole("button", { name: "后续更新 · 0", exact: true })
      .click();
    await expect(
      f.queue.getByText("当前条件下没有待审文字内容。", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/kind=UPDATE/);
    await f.queue
      .getByRole("button", { name: "新亲历 · 12", exact: true })
      .click();
    await expect(f.queue.locator(".review-item")).toHaveCount(12);
    await page.getByLabel("搜索待审标题、正文或对象").focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "查找待审内容" }),
    ).toBeFocused();
    for (const label of ["浅色模式", "深色模式"]) {
      await page.getByRole("button", { name: /^外观：/ }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await page
        .locator(".review-search:not(.material-search)")
        .screenshot({ path: `test-results/review-search-${label}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const button of await f.queue
      .getByRole("group", { name: "审核类型" })
      .getByRole("button")
      .all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 1200 });
    await page
      .locator(".review-search:not(.material-search)")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page
      .locator(".review-search:not(.material-search)")
      .screenshot({ path: "test-results/review-search-enlarged.png" });
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(page.getByLabel("搜索待审标题、正文或对象")).toHaveValue("");
  } finally {
    await f.cleanup();
  }
});

test("retries queue failures and ignores stale review navigation after changing filters", async ({
  page,
}) => {
  const f = await fixture(page);
  let release = () => {};
  try {
    await page.route(
      "**/api/v1/admin/review-queue?**",
      (route) => route.abort(),
      { times: 1 },
    );
    await f.queue
      .getByRole("button", { name: "新亲历 · 13", exact: true })
      .click();
    await expect(
      f.queue.getByRole("button", { name: "重试文字队列" }),
    ).toBeVisible();
    await f.queue.getByRole("button", { name: "重试文字队列" }).click();
    await expect(f.queue.locator(".review-item")).toHaveCount(12);
    await f.queue.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(f.queue.locator(".review-item")).toHaveCount(1);
    let captured = () => {};
    const waiting = new Promise<void>((resolve) => (captured = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      "**/api/v1/admin/reviews/POST/*/decision",
      async (route) => {
        const response = await route.fetch();
        captured();
        await gate;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await f.queue.getByLabel("审核说明").fill("核对虚构经历并公开");
    await f.queue
      .getByRole("button", { name: "通过并公开", exact: true })
      .click();
    await waiting;
    await f.queue
      .getByRole("button", { name: "后续更新 · 0", exact: true })
      .click();
    await expect(
      f.queue.getByText("当前条件下没有待审文字内容。", { exact: true }),
    ).toBeVisible();
    const refresh = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/material-queue") &&
        response.request().method() === "GET",
    );
    release();
    await refresh;
    await expect(page).toHaveURL(/kind=UPDATE/);
    await expect(page).toHaveURL(/page=1/);
    await expect(
      f.queue.getByRole("button", { name: "全部文字 · 12", exact: true }),
    ).toBeVisible();
    await page.getByLabel("搜索待审标题、正文或对象").fill("   ");
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(page.getByLabel("搜索待审标题、正文或对象")).toHaveValue("");
    await expect(page).toHaveURL(/kind=ALL/);
  } finally {
    release();
    await f.cleanup();
  }
});
