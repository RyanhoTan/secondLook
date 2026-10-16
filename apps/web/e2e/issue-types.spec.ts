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

async function selectSubject(page: Page, id: string, name: string) {
  await page.getByLabel("搜索对象名称或门店地址").fill(name);
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await expect(
    page.getByLabel("选择对象").locator(`option[value="${id}"]`),
  ).toHaveCount(1);
  await page.getByLabel("选择对象").selectOption(id);
}

test("restores multi-select issues and publishes tag-only corrections through review", async ({
  page,
  browser,
}) => {
  const username = `issues_browser_${Date.now()}`,
    password = "test-only-issues-2026";
  const account = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "虚构分类作者" },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const title = `问题分类虚构测试-${Date.now()}`;
  await login(page, username, password);
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await selectSubject(page, "demo-noodle", "山间面馆");
  await page.getByRole("checkbox", { name: "口味体验", exact: true }).check();
  await selectSubject(page, "demo-company", "远山工作室");
  await expect(
    page.getByRole("checkbox", { name: "口味体验", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "工作安排", exact: true }),
  ).toBeVisible();
  await selectSubject(page, "demo-noodle", "山间面馆");
  await expect(
    page.getByRole("checkbox", { name: "口味体验", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "口味体验", exact: true }).check();
  await page.getByRole("checkbox", { name: "收费说明", exact: true }).check();
  await page.getByLabel("用一句话概括").fill(title);
  await page.getByLabel("发生日期", { exact: true }).fill("2026-01-01");
  await page
    .getByLabel("说说你的亲身经历")
    .fill(
      "这是用于问题类型分类和版本恢复的虚构亲历，所有对象和经过均为演示。没有任何真实商家。",
    );
  await page.getByLabel("确认这是我的亲身经历，并愿意补充后续。").check();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".draft-actions [role=status]")).toContainText(
    "草稿已保存",
  );
  const draftUrl = page.url();
  await page.reload();
  await login(page, username, password);
  // Navigate within the app to retain the in-memory session after login.
  await page
    .getByRole("link", { name: "我的记录", exact: true })
    .first()
    .click();
  await page
    .getByRole("link", { name: "继续编辑", exact: true })
    .first()
    .click();
  expect(new URL(page.url()).searchParams.get("draft")).toBe(
    new URL(draftUrl).searchParams.get("draft"),
  );
  await expect(
    page.getByRole("checkbox", { name: "口味体验", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "收费说明", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "感谢你，多留一份依据。" }),
  ).toBeVisible();
  const headers = { Authorization: `Bearer ${admin.token}` };
  const queue = await (
    await page.request.get("/api/v1/admin/reviews", { headers })
  ).json();
  const post = queue.find(
    (p: { title: string; kind: string }) =>
      p.title === title && p.kind === "POST",
  );
  expect(post.issueTypes).toEqual(["PRICING", "TASTE"]);
  const adminContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const adminPage = await adminContext.newPage();
  try {
    await login(adminPage, "admin", "test-only-admin-2026");
    await adminPage.getByRole("link", { name: "内容审核" }).click();
    const row = adminPage.locator(".review-item").filter({
      has: adminPage.getByRole("heading", { name: title, exact: true }),
    });
    await expect(row.locator(".issue-types")).toContainText("口味体验");
    await expect(row.locator(".issue-types")).toContainText("收费说明");
    await row.getByLabel("审核说明").fill("虚构分类检查通过");
    await row.getByRole("button", { name: "通过并公开", exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("link", { name: "查看我的记录", exact: true }).click();
    await page
      .getByRole("link", { name: "修改原文 / 查看审核", exact: true })
      .first()
      .click();
    await page
      .getByRole("checkbox", { name: "口味体验", exact: true })
      .uncheck();
    await page
      .getByRole("checkbox", { name: "收费说明", exact: true })
      .uncheck();
    await page.getByRole("checkbox", { name: "卫生体验", exact: true }).check();
    await page
      .getByLabel("更正说明", { exact: true })
      .fill("仅调整问题分类，原文经过保持原意。");
    await page.getByRole("button", { name: "提交修改审核" }).click();
    await expect(
      page.getByRole("heading", { name: "修改已提交", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "返回公开记录" }).click();
    await expect(page.locator(".detail-header .issue-types")).toContainText(
      "口味体验",
    );
    await expect(page.locator(".detail-header .issue-types")).not.toContainText(
      "卫生体验",
    );
    // Review list refreshes when returning from another app route.
    await adminPage
      .getByRole("link", { name: "发现经历", exact: true })
      .first()
      .click();
    await adminPage.getByRole("link", { name: "内容审核" }).click();
    await expect(row.locator(".issue-types").last()).toContainText("卫生体验");
    await row.getByLabel("审核说明").fill("核对虚构分类的修订说明");
    await row.getByRole("button", { name: "通过并公开", exact: true }).click();
    await expect(row).toHaveCount(0);
    const publicData = await (
      await page.request.get(`/api/v1/posts/${post.id}`)
    ).json();
    expect(publicData.issueTypes).toEqual(["HYGIENE"]);
    expect(publicData.history[1].issueTypes).toEqual(["PRICING", "TASTE"]);
    const own = await page.request.get("/api/v1/me/posts", {
      headers: { Authorization: `Bearer ${account.token}` },
    });
    expect((await own.json()).total).toBe(1);
    await page
      .getByRole("link", { name: "发现经历", exact: true })
      .first()
      .click();
    await page.getByText("更多筛选与排序", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "问题类型筛选", exact: true })
      .selectOption("HYGIENE");
    await page.getByRole("button", { name: "应用筛选", exact: true }).click();
    await expect(page).toHaveURL(/issue=HYGIENE/);
    await expect(page.locator(".browse-sample")).toContainText(
      "问题类型：卫生体验",
    );
    await expect(
      page.locator(".post-card").filter({ hasText: title }),
    ).toHaveCount(1);
    await expect(page.locator(".post-card .issue-types").first()).toContainText(
      "卫生体验",
    );
    await page.reload();
    await page.getByText("更多筛选与排序", { exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "问题类型筛选", exact: true }),
    ).toHaveValue("HYGIENE");
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(page).not.toHaveURL(/issue=/);
    await page.goBack();
    await expect(page).toHaveURL(/issue=HYGIENE/);
  } finally {
    await adminContext.close();
  }
});

test("issue selection supports keyboard, both themes, narrow screens and larger text", async ({
  page,
}) => {
  await login(page, "demo", "test-only-demo-2026");
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await selectSubject(page, "demo-noodle", "山间面馆");
  const checkbox = page.getByRole("checkbox", {
    name: "口味体验",
    exact: true,
  });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const ratio = await page
      .locator(".issue-options label")
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
      .locator(".issue-picker")
      .screenshot({ path: `test-results/issues-${label}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const target of await page.locator(".issue-options label").all())
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const name of ["收费说明", "排队服务", "卫生体验"]) {
    await page.getByRole("checkbox", { name, exact: true }).check();
    await expect(
      page.getByRole("checkbox", { name, exact: true }),
    ).toBeChecked();
  }
  await page.setViewportSize({ width: 390, height: 1200 });
  await page
    .locator(".issue-picker")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .locator(".issue-picker")
    .screenshot({ path: "test-results/issues-enlarged.png" });
  await page.getByRole("checkbox", { name: "收费说明", exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "收费说明", exact: true }),
  ).toBeChecked();
});
