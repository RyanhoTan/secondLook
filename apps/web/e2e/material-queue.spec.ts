import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(page: Page) {
  const prefix = `材料分页-${Date.now()}`;
  const author = await (
    await page.request.post("/api/v1/auth/register", {
      data: {
        username: `mq_${Date.now()}`,
        password: "test-only-material-queue",
        nickname: "虚构材料队列作者",
      },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${author.token}` };
  const posts: string[] = [],
    ids: string[] = [];
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#b5b5b5";
    ctx.fillRect(0, 0, 200, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  for (let n = 1; n <= 13; n++) {
    if ((n - 1) % 5 === 0) {
      const result = await page.request.post("/api/v1/posts", {
        headers,
        data: {
          clientKey: randomUUID(),
          subjectId: "demo-noodle",
          title: `${prefix}亲历 ${n}`,
          body: "这是用于审核分页、检索和版本保护的虚构亲历，不涉及真实对象。",
          occurredOn: "2024-01-01",
          issueTypes: ["TASTE"],
          anonymous: true,
          personalExperience: true,
        },
      });
      expect(result.status()).toBe(201);
      posts.push((await result.json()).id);
    }
    const result = await page.request.post(
      `/api/v1/posts/${posts.at(-1)}/materials`,
      {
        headers,
        multipart: {
          source: `${prefix}-${String(n).padStart(2, "0")}`,
          visibility: n % 2 === 0 ? "REVIEW_ONLY" : "PUBLIC",
          clientKey: randomUUID(),
          file: {
            name: "fiction.png",
            mimeType: "image/png",
            buffer: Buffer.from(png, "base64"),
          },
        },
      },
    );
    expect(result.status()).toBe(201);
    ids.push((await result.json()).id);
  }
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("test-only-admin-2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "内容审核" }).click();
  const queue = page.getByRole("region", { name: "材料审核", exact: true });
  await expect(
    queue.getByRole("heading", { name: "图片材料审核" }),
  ).toBeVisible();
  await queue.getByLabel("搜索材料来源、正文或对象").fill(prefix);
  await queue
    .getByRole("button", { name: "查找待审材料", exact: true })
    .click();
  await expect(queue.locator(".material-review-item")).toHaveCount(12);
  await expect(queue.getByText(/共 13 份/)).toBeVisible();
  return {
    prefix,
    queue,
    async cleanup() {
      for (const id of ids)
        expect(
          (
            await page.request.delete(`/api/v1/materials/${id}`, { headers })
          ).status(),
        ).toBe(204);
      for (const id of posts)
        expect(
          (
            await page.request.post(
              `/api/v1/admin/reviews/POST/${id}/decision`,
              {
                headers: { Authorization: `Bearer ${admin.token}` },
                data: { action: "REJECT", reason: "清理虚构材料分页帖子" },
              },
            )
          ).status(),
        ).toBe(204);
    },
  };
}

test("pages and filters pending materials while retaining redactions during text filtering", async ({
  page,
}) => {
  const f = await fixture(page);
  try {
    await expect(
      f.queue.locator(".material-review-item").first(),
    ).toContainText(`${f.prefix}-01`);
    await f.queue.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(1);
    await expect(f.queue.locator(".material-review-item")).toContainText(
      `${f.prefix}-13`,
    );
    await page.goBack();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(12);
    await page.goForward();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(1);
    const row = f.queue.locator(".material-review-item");
    await row.getByRole("button", { name: "添加遮挡", exact: true }).click();
    await row
      .getByLabel("材料审核说明", { exact: true })
      .fill("保留这份虚构遮挡与审核说明");
    const text = page.getByRole("region", {
      name: "文字审核队列",
      exact: true,
    });
    await text.getByLabel("搜索待审标题、正文或对象").fill("无匹配的文字条件");
    await text
      .getByRole("button", { name: "查找待审内容", exact: true })
      .click();
    await expect(
      text.getByText("当前条件下没有待审文字内容。", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/materialPage=2/);
    await expect(
      row.getByRole("button", { name: "移除遮挡 1", exact: true }),
    ).toBeVisible();
    await expect(row.getByLabel("材料审核说明", { exact: true })).toHaveValue(
      "保留这份虚构遮挡与审核说明",
    );
    await row.getByRole("button", { name: "拒绝此材料", exact: true }).click();
    await expect(page).toHaveURL(/materialPage=1/);
    await expect(f.queue.locator(".material-review-item")).toHaveCount(12);
    await expect(
      f.queue.getByRole("navigation", { name: "材料审核分页" }),
    ).toHaveCount(0);
    await f.queue
      .getByRole("combobox", { name: "材料公开范围", exact: true })
      .selectOption("REVIEW_ONLY");
    await f.queue
      .getByRole("button", { name: "查找待审材料", exact: true })
      .click();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(6);
    await expect(page).toHaveURL(/q=.*materialVisibility=REVIEW_ONLY/);
    await expect(text.getByLabel("搜索待审标题、正文或对象")).toHaveValue(
      "无匹配的文字条件",
    );
    await f.queue
      .getByRole("combobox", { name: "材料待审状态", exact: true })
      .selectOption("NEEDS_REVIEW");
    await f.queue
      .getByRole("button", { name: "查找待审材料", exact: true })
      .click();
    await expect(
      f.queue.getByText("没有等待审核的图片材料。", { exact: true }),
    ).toBeVisible();
    await f.queue.getByLabel("搜索材料来源、正文或对象").focus();
    await page.keyboard.press("Tab");
    await expect(
      f.queue.getByRole("combobox", { name: "材料待审状态", exact: true }),
    ).toBeFocused();
    for (const label of ["浅色模式", "深色模式"]) {
      await page.getByRole("button", { name: /^外观：/ }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await page
        .locator(".material-search")
        .screenshot({ path: `test-results/material-search-${label}.png` });
    }
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const control of await f.queue
      .locator(
        ".material-search input,.material-search select,.material-search button",
      )
      .all())
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".material-search")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page
      .locator(".material-search")
      .screenshot({ path: "test-results/material-search-enlarged.png" });
    await f.queue
      .getByRole("button", { name: "清除材料筛选", exact: true })
      .click();
    await expect(f.queue.getByLabel("搜索材料来源、正文或对象")).toHaveValue(
      "",
    );
    await expect(text.getByLabel("搜索待审标题、正文或对象")).toHaveValue(
      "无匹配的文字条件",
    );
  } finally {
    await f.cleanup();
  }
});

test("retries material queue failures and preserves new filters when an earlier decision completes", async ({
  page,
}) => {
  const f = await fixture(page);
  let release = () => {};
  try {
    await page.route(
      "**/api/v1/admin/material-queue?**",
      (route) => route.abort(),
      { times: 1 },
    );
    await f.queue
      .getByRole("combobox", { name: "材料待审状态", exact: true })
      .selectOption("NEEDS_REVIEW");
    await f.queue
      .getByRole("button", { name: "查找待审材料", exact: true })
      .click();
    await expect(
      f.queue.getByRole("button", { name: "重试材料队列", exact: true }),
    ).toBeVisible();
    await f.queue
      .getByRole("button", { name: "重试材料队列", exact: true })
      .click();
    await expect(
      f.queue.getByText("没有等待审核的图片材料。", { exact: true }),
    ).toBeVisible();
    await f.queue
      .getByRole("combobox", { name: "材料待审状态", exact: true })
      .selectOption("ALL");
    await f.queue
      .getByRole("button", { name: "查找待审材料", exact: true })
      .click();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(12);
    await f.queue.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(1);
    let captured = () => {};
    const waiting = new Promise<void>((resolve) => (captured = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      "**/api/v1/admin/materials/*/decision",
      async (route) => {
        const response = await route.fetch();
        captured();
        await gate;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await f.queue
      .getByLabel("材料审核说明", { exact: true })
      .fill("虚构材料拒绝说明");
    await f.queue
      .getByRole("button", { name: "拒绝此材料", exact: true })
      .click();
    await waiting;
    await f.queue
      .getByRole("combobox", { name: "材料公开范围", exact: true })
      .selectOption("REVIEW_ONLY");
    await f.queue
      .getByRole("button", { name: "查找待审材料", exact: true })
      .click();
    await expect(f.queue.locator(".material-review-item")).toHaveCount(6);
    const refresh = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/admin/material-queue?") &&
        response.request().method() === "GET",
    );
    release();
    await refresh;
    await expect(page).toHaveURL(/materialVisibility=REVIEW_ONLY/);
    await expect(page).toHaveURL(/materialPage=1/);
    await expect(f.queue.locator(".material-review-item")).toHaveCount(6);
  } finally {
    release();
    await f.cleanup();
  }
});
