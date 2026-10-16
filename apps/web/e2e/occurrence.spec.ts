import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
}
async function account(page: Page) {
  const username = `occurrence_${Date.now()}`,
    password = "test-only-occurrence-2026";
  const created = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "时间精度虚构作者" },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  return {
    username,
    password,
    token: created.token as string,
    admin: { Authorization: `Bearer ${admin.token}` },
  };
}
async function start(page: Page) {
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await page.getByLabel("搜索对象名称或门店地址").fill("山间面馆");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await page.getByLabel("选择对象").selectOption("demo-noodle");
  await page.getByRole("checkbox", { name: "口味体验", exact: true }).check();
}

test("restores a month draft, previews reported precision and finds it by an overlapping day", async ({
  page,
}) => {
  const user = await account(page),
    title = `虚构月份记录-${Date.now()}`;
  await login(page, user.username, user.password);
  await start(page);
  await page.getByLabel("用一句话概括").fill(title);
  await page
    .getByRole("combobox", { name: "发生时间精度", exact: true })
    .selectOption("MONTH");
  await page.getByLabel("发生月份", { exact: true }).fill("2024-02");
  await page
    .getByLabel("说说你的亲身经历")
    .fill(
      "这是用于验证月份精度的虚构经历，只能确认发生月份，不应被公开展示为某一天。",
    );
  await page.getByLabel("确认这是我的亲身经历，并愿意补充后续。").check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".draft-actions [role=status]")).toContainText(
    "草稿已保存",
  );
  await page.reload();
  await login(page, user.username, user.password);
  await page
    .getByRole("link", { name: "我的记录", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: "继续编辑", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "发生时间精度", exact: true }),
  ).toHaveValue("MONTH");
  await expect(page.getByLabel("发生月份", { exact: true })).toHaveValue(
    "2024-02",
  );
  await page.getByRole("button", { name: "预览发布内容", exact: true }).click();
  await expect(page.locator(".post-preview")).toContainText(
    "2024 年 02 月（月份）",
  );
  await expect(page.locator(".post-preview")).not.toContainText("2024-02-01");
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "感谢你，多留一份依据。" }),
  ).toBeVisible();
  const own = await (
    await page.request.get("/api/v1/me/posts", {
      headers: { Authorization: `Bearer ${user.token}` },
    })
  ).json();
  const id = own.items[0].id;
  expect(
    (
      await page.request.post(`/api/v1/admin/reviews/POST/${id}/decision`, {
        headers: user.admin,
        data: { action: "APPROVE", reason: "确认虚构月份输入" },
      })
    ).status(),
  ).toBe(204);
  await page.goto(
    `/?q=${encodeURIComponent(title)}&occurredFrom=2024-02-29&occurredTo=2024-02-29`,
  );
  await expect(page.locator(".post-card")).toHaveCount(1);
  await expect(page.locator(".record-date")).toContainText(
    "2024 年 02 月（月份）",
  );
  await expect(page.locator(".browse-sample")).toContainText(
    "时间范围相交即显示",
  );
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.locator(".detail-meta")).toContainText(
    "2024 年 02 月（月份）",
  );
  await expect(page.locator(".detail-meta")).not.toContainText("2024-02-01");
});

test("reviews a change from approximate range to month without changing the old public time early", async ({
  page,
}) => {
  const user = await account(page),
    title = `虚构范围修订-${Date.now()}`;
  const created = await (
    await page.request.post("/api/v1/posts", {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        clientKey: randomUUID(),
        subjectId: "demo-noodle",
        title,
        body: "这是一条用于范围与月份修订验证的虚构记录，原始大致范围须保持到新版审核通过。",
        occurredOn: "2023-05-10",
        occurredUntil: "2023-05-20",
        occurredPrecision: "RANGE",
        issueTypes: ["TASTE"],
        anonymous: true,
        personalExperience: true,
      },
    })
  ).json();
  const id = created.id;
  expect(
    (
      await page.request.post(`/api/v1/admin/reviews/POST/${id}/decision`, {
        headers: user.admin,
        data: { action: "APPROVE", reason: "确认虚构范围输入" },
      })
    ).status(),
  ).toBe(204);
  await page.goto(`/posts/${id}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await expect(page.locator(".detail-meta")).toContainText(
    "2023-05-10 至 2023-05-20（大致时间）",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await expect(page.locator(".post-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".record-date")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .locator(".record-date")
    .screenshot({ path: "test-results/occurrence-range-enlarged.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, user.username, user.password);
  await page
    .getByRole("link", { name: "我的记录", exact: true })
    .first()
    .click();
  await page
    .getByRole("link", { name: "修改原文 / 查看审核", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "发生时间精度", exact: true }),
  ).toHaveValue("RANGE");
  await expect(page.getByLabel("发生时间至", { exact: true })).toHaveValue(
    "2023-05-20",
  );
  await page
    .getByRole("combobox", { name: "发生时间精度", exact: true })
    .selectOption("MONTH");
  await page.getByLabel("发生月份", { exact: true }).fill("2022-12");
  await page
    .getByLabel("更正说明", { exact: true })
    .fill("重新核对后只能确认月份，不能继续使用原来的大致范围。");
  await page.getByRole("button", { name: "提交修改审核" }).click();
  await expect(
    page.getByRole("heading", { name: "修改已提交", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回公开记录" }).click();
  await expect(page.locator(".detail-meta")).toContainText(
    "2023-05-10 至 2023-05-20（大致时间）",
  );
  const queue = await (
    await page.request.get("/api/v1/admin/reviews", { headers: user.admin })
  ).json();
  const revision = queue.find(
    (r: { title: string; kind: string }) =>
      r.title === title && r.kind === "REVISION",
  );
  expect(revision.occurredOn).toBe("2022-12");
  expect(revision.previous.occurredPrecision).toBe("RANGE");
  expect(
    (
      await page.request.post(
        `/api/v1/admin/reviews/REVISION/${revision.id}/decision`,
        {
          headers: user.admin,
          data: { action: "APPROVE", reason: "虚构精度修订审核通过" },
        },
      )
    ).status(),
  ).toBe(204);
  await page.reload();
  await expect(page.locator(".detail-meta")).toContainText(
    "2022 年 12 月（月份）",
  );
  await page.getByText("版本历史 · 当前第 2 版", { exact: true }).click();
  const old = page.locator(".revision-history article").filter({
    has: page.getByRole("heading", { name: "第 1 版", exact: true }),
  });
  await old.getByText("阅读此版本", { exact: true }).click();
  await expect(old).toContainText("2023-05-10 至 2023-05-20（大致时间）");
});

test("time precision controls remain usable across themes, enlarged text and mode changes", async ({
  page,
}) => {
  const user = await account(page);
  await login(page, user.username, user.password);
  await start(page);
  await page.getByLabel("用一句话概括").fill("切换精度不能丢失其他字段");
  await page.getByLabel("发生日期", { exact: true }).fill("2024-03-15");
  await page
    .getByRole("combobox", { name: "发生时间精度", exact: true })
    .selectOption("MONTH");
  await expect(page.getByLabel("发生月份", { exact: true })).toHaveValue(
    "2024-03",
  );
  await page
    .getByRole("combobox", { name: "发生时间精度", exact: true })
    .selectOption("DAY");
  await expect(page.getByLabel("发生日期", { exact: true })).toHaveValue("");
  await page
    .getByRole("combobox", { name: "发生时间精度", exact: true })
    .selectOption("RANGE");
  await page.getByLabel("发生时间从", { exact: true }).fill("2024-03-10");
  await page.getByLabel("发生时间至", { exact: true }).fill("2024-03-20");
  await expect(page.getByLabel("用一句话概括")).toHaveValue(
    "切换精度不能丢失其他字段",
  );
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const ratio = await page
      .locator(".occurrence-fields input")
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        function luminance(color: string) {
          return (color.match(/[\d.]+/g) ?? [])
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const n = v / 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
        }
        const values = [
          luminance(style.color),
          luminance(style.backgroundColor),
        ].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page
      .locator(".occurrence-fields")
      .screenshot({ path: `test-results/occurrence-${label}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const input of await page
    .locator(".occurrence-fields input, .occurrence-fields select")
    .all())
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel("发生时间至", { exact: true }).focus();
  await expect(page.getByLabel("发生时间至", { exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 1200 });
  await page
    .locator(".occurrence-fields")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .locator(".occurrence-fields")
    .screenshot({ path: "test-results/occurrence-enlarged.png" });
});
