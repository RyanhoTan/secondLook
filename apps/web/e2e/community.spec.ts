import { test, expect, type Page } from "@playwright/test";
async function chooseTheme(page: Page, label: string) {
  await page.getByRole("button", { name: /^外观：/ }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator(".appearance-options")).toHaveCount(0);
}
async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.screenshot({ path: "test-results/login-redesign.png" });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
}
test("search, category filters, object details and share routes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".post-card")).toHaveCount(3);
  await page.getByRole("button", { name: "饭店", exact: true }).click();
  await expect(page.locator(".post-card")).toHaveCount(1);
  await page.getByRole("link", { name: "示例 · 山间面馆 饭店 · 杭州" }).click();
  await expect(
    page.getByRole("heading", { name: "示例 · 山间面馆", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /菜单标注与实际收费不一致/ }).click();
  await expect(page.getByRole("heading", { name: "后续与变化" })).toBeVisible();
  await page.screenshot({ path: "test-results/detail-redesign.png" });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "菜单标注与实际收费不一致",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "搜索公司、饭店、景点或经历" })
    .fill("不存在的关键词");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByText("没有找到相关经历。试试其他关键词，或记录你的第一次体验。"),
  ).toBeVisible();
});
test("light/dark/system themes persist and mobile layout does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto("/");
  await expect(page.locator(".post-card")).toHaveCount(3);
  await chooseTheme(page, "浅色模式");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "test-results/discover-light.png" });
  await chooseTheme(page, "深色模式");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/discover-dark.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await page.screenshot({ path: "test-results/discover-mobile.png" });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await chooseTheme(page, "跟随系统");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("readable text, touch targets and larger text preserve the layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of ["全部经历", "公司", "饭店", "景点", "其他"]) {
    const rect = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(rect?.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page
      .locator(".post-content p")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(15);
  expect(
    await page
      .locator(".post-card .tag")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(12);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/discover-large-text.png" });
});
test("keyboard focus and text contrast work in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  for (const label of ["浅色模式", "深色模式"]) {
    await chooseTheme(page, label);
    const ratios = await page.evaluate(() => {
      function channels(color: string) {
        return (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      }
      function luminance(values: number[]) {
        return values
          .map((v) => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          })
          .reduce((total, n, i) => total + n * [0.2126, 0.7152, 0.0722][i], 0);
      }
      return [".post-content p", ".post-card .tag"].map((selector) => {
        const element = document.querySelector(selector)!;
        let parent: Element | null = element;
        let background = "";
        while (parent) {
          const c = getComputedStyle(parent).backgroundColor;
          if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") {
            background = c;
            break;
          }
          parent = parent.parentElement;
        }
        const values = [
          luminance(channels(getComputedStyle(element).color)),
          luminance(channels(background)),
        ].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      });
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
test("new navigation and interruptible disclosures remain usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  const guide = page.getByRole("button", { name: "如何看待这些记录" });
  await guide.click();
  await expect(
    page.getByRole("heading", { name: "看依据，也看后续。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭阅读说明" }).click();
  await guide.click();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveAttribute("aria-expanded", "false");
  await expect(guide).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "公司", exact: true }).click();
  await page.getByRole("button", { name: "饭店", exact: true }).click();
  await expect(page.locator(".post-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "饭店", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "手机导航" })
    .getByRole("link", { name: "我的", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "登录后继续" })).toBeVisible();
});
test("publish, moderate, follow and track a subsequent update through the browser", async ({
  browser,
  page,
}) => {
  await login(page, "demo", "test-only-demo-2026");
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await page.getByLabel("选择对象").selectOption("demo-noodle");
  await page.screenshot({ path: "test-results/write-redesign.png" });
  await page.getByLabel("用一句话概括").fill("浏览器测试：一次具体的虚构经历");
  await page.getByLabel("发生日期").fill("2026-01-01");
  await page
    .getByLabel("说说你的亲身经历")
    .fill(
      "这是一条用于浏览器测试的虚构经历，我们检查投稿、审核和后续通知是否可以完整走通。",
    );
  await page.getByLabel("确认这是我的亲身经历，并愿意补充后续。").check();
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "感谢你，多留一份依据。" }),
  ).toBeVisible();
  const adminContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const admin = await adminContext.newPage();
  await login(admin, "admin", "test-only-admin-2026");
  await admin.getByRole("link", { name: "内容审核" }).click();
  const review = admin
    .locator(".review-item")
    .filter({ hasText: "浏览器测试：一次具体的虚构经历" });
  await review
    .getByLabel("审核说明")
    .fill("虚构测试案例，符合当前演示发布规则");
  await review.getByRole("button", { name: "通过并公开" }).click();
  await expect(review).toHaveCount(0);
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  const own = page
    .locator(".own-list article")
    .filter({ hasText: "浏览器测试：一次具体的虚构经历" });
  await own
    .getByRole("link", { name: "浏览器测试：一次具体的虚构经历" })
    .click();
  const readerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const reader = await readerContext.newPage();
  await reader.goto("/login");
  await reader.getByRole("button", { name: "还没有账号？创建一个" }).click();
  await reader
    .getByLabel("登录名", { exact: true })
    .fill(`reader_${Date.now()}`);
  await reader.getByLabel("公开昵称").fill("浏览器测试读者");
  await reader
    .getByLabel("密码", { exact: true })
    .fill("test-only-reader-2026");
  await reader.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: "发现经历", exact: true }),
  ).toBeVisible();
  await reader
    .getByRole("link", { name: /浏览器测试：一次具体的虚构经历/ })
    .click();
  await reader.getByRole("button", { name: "关注后续", exact: true }).click();
  await expect(
    reader.getByRole("button", { name: "已关注 · 点击取消" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  const authorPost = page
    .locator(".own-list article")
    .filter({ hasText: "浏览器测试：一次具体的虚构经历" });
  await authorPost.getByText("补充后续进展", { exact: true }).click();
  await authorPost.getByLabel("更新标题").fill("浏览器测试：作者报告已退款");
  await authorPost
    .getByLabel("发生了什么变化")
    .fill("这是测试用的虚构后续，退款不代表原始经历不真实。");
  await authorPost
    .getByRole("button", { name: "提交审核", exact: true })
    .click();
  await expect(authorPost.getByRole("status")).toHaveText(
    "进展已提交，审核后公开。",
  );
  await admin.getByRole("link", { name: "发现经历" }).click();
  await admin.getByRole("link", { name: "内容审核" }).click();
  const update = admin
    .locator(".review-item")
    .filter({ hasText: "浏览器测试：作者报告已退款" });
  await update.getByLabel("审核说明").fill("虚构后续审核通过");
  await update.getByRole("button", { name: "通过并公开" }).click();
  await expect(update).toHaveCount(0);
  await reader.getByRole("link", { name: "后续追踪", exact: true }).click();
  await expect(
    reader.getByRole("heading", { name: "浏览器测试：作者报告已退款" }),
  ).toBeVisible();
  await reader.getByRole("button", { name: "标为已读" }).click();
  await expect(reader.getByRole("button", { name: "标为已读" })).toHaveCount(0);
  await adminContext.close();
  await readerContext.close();
});

test("review corrections without leaking pending text and retain safe version history", async ({
  page,
  browser,
}) => {
  const username = `correction_${Date.now()}`;
  const password = "test-only-correction-2026";
  const createdUser = await page.request.post("/api/v1/auth/register", {
    data: { username, nickname: "更正测试作者", password },
  });
  const { token } = await createdUser.json();
  const adminLogin = await page.request.post("/api/v1/auth/login", {
    data: { username: "admin", password: "test-only-admin-2026" },
  });
  const { token: adminToken } = await adminLogin.json();
  const createdPost = await page.request.post("/api/v1/posts", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      subjectId: "demo-noodle",
      title: "版本测试：原始的虚构经历",
      body: "这是仅供版本测试使用的虚构原文，其中的发生日期需要后续核对更正。",
      occurredOn: "2026-01-01",
      anonymous: true,
      personalExperience: true,
    },
  });
  const { id } = await createdPost.json();
  expect(
    (
      await page.request.post(`/api/v1/admin/reviews/POST/${id}/decision`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { action: "APPROVE", reason: "虚构初稿审核通过" },
      })
    ).status(),
  ).toBe(204);
  await login(page, username, password);
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  await page.getByRole("link", { name: "修改原文 / 查看审核" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("版本测试：核对后的虚构经历");
  await page.getByLabel("发生日期", { exact: true }).fill("2026-01-02");
  await page
    .getByLabel("经历正文")
    .fill(
      "这是更正后的虚构正文，已经重新核对发生时间和收费说明，保留具体经过。 ",
    );
  await page
    .getByLabel("更正说明", { exact: true })
    .fill("核对凭据后，修正日期和原文中的说明。");
  await page.getByRole("button", { name: "提交修改审核" }).click();
  await expect(page.getByRole("heading", { name: "修改已提交" })).toBeVisible();
  await page.getByRole("link", { name: "返回公开记录" }).click();
  await expect(
    page.getByRole("heading", {
      name: "版本测试：原始的虚构经历",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("重要更正")).toHaveCount(0);
  const adminContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const admin = await adminContext.newPage();
    await login(admin, "admin", "test-only-admin-2026");
    await admin.getByRole("link", { name: "内容审核" }).click();
    const review = admin
      .locator(".review-item")
      .filter({ hasText: "版本测试：核对后的虚构经历" });
    await review
      .getByText("对照当前公开版本（第 1 版）", { exact: true })
      .click();
    await expect(
      review.getByRole("heading", { name: "版本测试：原始的虚构经历" }),
    ).toBeVisible();
    await review.getByLabel("审核说明").fill("核对虚构更正，符合发布规则");
    await review.getByRole("button", { name: "通过并公开" }).click();
    await expect(review).toHaveCount(0);
    await page.getByRole("link", { name: "发现经历", exact: true }).click();
    const card = page
      .locator(".post-card")
      .filter({ hasText: "版本测试：核对后的虚构经历" });
    await expect(card.locator(".correction-preview")).toContainText(
      "核对凭据后",
    );
    await card
      .getByRole("link", { name: /版本测试：核对后的虚构经历/ })
      .click();
    await expect(page.getByLabel("重要更正")).toContainText(
      "作者已更正 · 第 2 版",
    );
    await page.locator(".revision-history > summary").click();
    const first = page
      .locator(".revision-history article")
      .filter({ hasText: "第 1 版" });
    await first.getByText("阅读此版本", { exact: true }).click();
    await expect(first).toContainText("虚构原文");
    for (const theme of ["浅色模式", "深色模式"]) {
      await chooseTheme(page, theme);
      await page.screenshot({
        path: `test-results/correction-${theme === "浅色模式" ? "light" : "dark"}.png`,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/correction-mobile-large-text.png",
    });
    await admin.getByRole("link", { name: "发现经历", exact: true }).click();
    await admin
      .getByRole("link", { name: /版本测试：核对后的虚构经历/ })
      .click();
    await admin.locator(".revision-history > summary").click();
    const old = admin
      .locator(".revision-history article")
      .filter({ hasText: "第 1 版" });
    await old
      .getByLabel("隐藏历史的处理理由")
      .fill("虚构隐私处理：限制旧版本公开");
    await old.getByRole("button", { name: "限制此历史版本公开" }).click();
    await admin.locator(".revision-history > summary").click();
    await expect(admin.locator(".revision-history")).toContainText(
      "此版本已限制公开",
    );
  } finally {
    await adminContext.close();
  }
});

test("upload and redact materials with private-only review and withdrawal", async ({
  page,
  browser,
}) => {
  const loginResponse = await page.request.post("/api/v1/auth/login", {
    data: { username: "demo", password: "test-only-demo-2026" },
  });
  const { token } = await loginResponse.json();
  const adminLogin = await page.request.post("/api/v1/auth/login", {
    data: { username: "admin", password: "test-only-admin-2026" },
  });
  const { token: adminToken } = await adminLogin.json();
  const created = await page.request.post("/api/v1/posts", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      subjectId: "demo-noodle",
      title: "材料测试：只使用虚构的截图",
      body: "这是用于材料上传、公开副本脱敏、仅供审核与撤回流程的虚构亲历，不涉及真实个人信息。",
      occurredOn: "2026-01-01",
      anonymous: true,
      personalExperience: true,
    },
  });
  const { id } = await created.json();
  expect(
    (
      await page.request.post(`/api/v1/admin/reviews/POST/${id}/decision`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { action: "APPROVE", reason: "虚构图片流程测试" },
      })
    ).status(),
  ).toBe(204);
  await login(page, "demo", "test-only-demo-2026");
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, 240, 120);
    ctx.fillStyle = "#222";
    ctx.font = "18px sans-serif";
    ctx.fillText("FICTIONAL MATERIAL", 20, 60);
    return canvas.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  await page
    .locator(".own-list article")
    .filter({ hasText: "材料测试：只使用虚构的截图" })
    .getByRole("link", { name: "添加 / 管理图片材料", exact: true })
    .click();
  await page
    .getByLabel("选择图片", { exact: true })
    .setInputFiles({ name: "fictional.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("来源与关联说明")
    .fill("公开材料来源：虚构截图，用于测试收费陈述。");
  await page.getByRole("button", { name: "上传材料", exact: true }).click();
  await expect(
    page.getByText("材料已上传，审核前不会公开。可继续添加其他材料。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    (await page.request.get(`/api/v1/posts/${id}/materials`)).json(),
  ).resolves.toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const adminContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const admin = await adminContext.newPage();
    await login(admin, "admin", "test-only-admin-2026");
    await admin.getByRole("link", { name: "内容审核" }).click();
    const material = admin
      .locator(".material-review-item")
      .filter({ hasText: "材料测试：只使用虚构的截图" });
    await expect(material.locator("img")).toBeVisible();
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await admin.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
    });
    await admin.setViewportSize({ width: 1280, height: 720 });
    await material.locator("img").scrollIntoViewIfNeeded();
    const box = (await material.locator("img").boundingBox())!;
    await admin.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await admin.mouse.down();
    await admin.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, {
      steps: 4,
    });
    await expect(material.locator(".redaction-mask")).toHaveCount(1);
    await admin.mouse.up();
    await expect(
      material.getByRole("button", { name: "移除遮挡 1" }),
    ).toBeVisible();
    await material.getByLabel("左侧位置 %").fill("5");
    await material
      .getByRole("button", { name: "添加遮挡", exact: true })
      .click();
    await material.getByRole("button", { name: "移除遮挡 2" }).click();
    await admin.evaluate(() => window.scrollTo(0, 0));
    await admin.screenshot({
      path: "test-results/material-redaction.png",
      fullPage: true,
    });
    await material
      .getByLabel("材料审核说明", { exact: true })
      .fill("虚构材料相关，已完整遮挡测试区域。");
    await material
      .getByLabel("已检查图片、来源说明的隐私与相关性；公开副本遮挡范围完整。")
      .check();
    await material
      .getByRole("button", { name: "通过并公开副本", exact: true })
      .click();
    await expect(material).toHaveCount(0);
    await page
      .getByLabel("选择图片", { exact: true })
      .setInputFiles({ name: "private.png", mimeType: "image/png", buffer });
    await page
      .getByLabel("来源与关联说明")
      .fill("仅审核来源：这段说明不应出现在公开页面。");
    await page.getByLabel("材料可见范围").selectOption("REVIEW_ONLY");
    await page.getByRole("button", { name: "上传材料", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "等待审核 · 仅供审核" }),
    ).toBeVisible();
    await admin.getByRole("link", { name: "发现经历", exact: true }).click();
    await admin.getByRole("link", { name: "内容审核" }).click();
    const privateItem = admin
      .locator(".material-review-item")
      .filter({ hasText: "仅审核来源" });
    await privateItem
      .getByLabel("材料审核说明", { exact: true })
      .fill("仅供审核的虚构材料，保持私密。");
    await privateItem
      .getByLabel("已检查图片、来源说明的隐私与相关性；公开副本遮挡范围完整。")
      .check();
    await privateItem
      .getByRole("button", { name: "通过，仅供审核", exact: true })
      .click();
    await expect(privateItem).toHaveCount(0);
    await page.getByRole("link", { name: "返回我的记录", exact: true }).click();
    await page
      .getByRole("link", { name: "材料测试：只使用虚构的截图", exact: true })
      .click();
    await expect(page.locator(".detail-header .tag")).toHaveText("已附材料");
    await expect(page.getByLabel("公开材料").locator("img")).toBeVisible();
    await expect(page.getByLabel("公开材料")).not.toContainText("仅审核来源");
    for (const theme of ["浅色模式", "深色模式"]) {
      await chooseTheme(page, theme);
      await page.screenshot({
        path: `test-results/material-public-${theme === "浅色模式" ? "light" : "dark"}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "100%";
    });
    const publicList = await (
      await page.request.get(`/api/v1/posts/${id}/materials`)
    ).json();
    expect(publicList).toHaveLength(1);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("link", { name: "我的记录", exact: true }).click();
    await page
      .locator(".own-list article")
      .filter({ hasText: "材料测试：只使用虚构的截图" })
      .getByRole("link", { name: "添加 / 管理图片材料", exact: true })
      .click();
    await page
      .locator(".material-own-list article")
      .filter({ hasText: "公开材料来源" })
      .getByRole("button", { name: "撤回此材料", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "材料已撤回，原公开链接已失效。",
    );
    expect(
      (
        await page.request.get(`/api/v1/materials/${publicList[0].id}/public`)
      ).status(),
    ).toBe(404);
  } finally {
    await adminContext.close();
  }
});

test("search past fifty objects and page personal and subject records without losing selection", async ({
  page,
}) => {
  const username = `paging_${Date.now()}`,
    password = "test-only-pagination-2026";
  const account = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, nickname: "分页测试作者", password },
    })
  ).json();
  const admin = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${account.token}` };
  for (let i = 0; i < 55; i++)
    expect(
      (
        await page.request.post("/api/v1/subjects", {
          headers,
          data: {
            name: `分页对象 ${i}`,
            category: "OTHER",
            city: "虚构市",
            address: `虚构路 ${i} 号`,
          },
        })
      ).ok(),
    ).toBe(true);
  for (let i = 0; i < 14; i++) {
    const post = await (
      await page.request.post("/api/v1/posts", {
        headers,
        data: {
          subjectId: "demo-noodle",
          title: `分页测试：记录 ${String(i).padStart(2, "0")}`,
          body: "这是用于多页列表与对象搜索验证的虚构经历，不涉及任何真实个人和商家。",
          occurredOn: "2026-01-01",
          anonymous: true,
          personalExperience: true,
        },
      })
    ).json();
    expect(
      (
        await page.request.post(
          `/api/v1/admin/reviews/POST/${post.id}/decision`,
          {
            headers: { Authorization: `Bearer ${admin.token}` },
            data: { action: "APPROVE", reason: "分页测试虚构记录" },
          },
        )
      ).status(),
    ).toBe(204);
  }
  await login(page, username, password);
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await expect(
    page.getByLabel("选择对象").locator('option[value="demo-noodle"]'),
  ).toHaveCount(0);
  await page.getByLabel("搜索对象名称或门店地址").fill("山间面馆");
  await page.getByLabel("搜索对象名称或门店地址").press("Enter");
  await page.getByLabel("选择对象").selectOption("demo-noodle");
  await page.getByLabel("搜索对象名称或门店地址").fill("分页对象");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  const pickerPaging = page.getByRole("navigation", { name: "对象选择分页" });
  await pickerPaging
    .getByRole("button", { name: "下一页", exact: true })
    .click();
  await expect(pickerPaging.getByRole("status")).toHaveText("第 2 / 5 页");
  await expect(page.getByLabel("选择对象")).toHaveValue("demo-noodle");
  await page.getByLabel("搜索对象名称或门店地址").fill("完全没有这个对象");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await expect(page.getByText(/没有找到对象，可以换个关键词/)).toBeVisible();
  await expect(page.getByLabel("选择对象")).toHaveValue("demo-noodle");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  await expect(page.locator(".own-list article")).toHaveCount(12);
  await page
    .getByRole("navigation", { name: "我的记录分页" })
    .getByRole("button", { name: "下一页" })
    .click();
  await expect(page.locator(".own-list article")).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "我的记录分页" }).getByRole("status"),
  ).toHaveText("第 2 / 2 页");
  await page
    .getByRole("link", { name: "分页测试：记录 00", exact: true })
    .click();
  await page.locator(".detail-header .eyebrow").click();
  await expect(page.locator(".post-card")).toHaveCount(12);
  const objectPaging = page.getByRole("navigation", { name: "对象经历分页" });
  await objectPaging.getByRole("button", { name: "下一页" }).click();
  await expect(objectPaging.getByRole("status")).toContainText("第 2 /");
  await expect(
    page.getByRole("link", { name: /菜单标注与实际收费不一致/ }),
  ).toBeVisible();
});

test("reassess materials for corrected text while retaining historical approvals", async ({
  page,
  browser,
}) => {
  const username = `material_version_${Date.now()}`,
    password = "test-only-version-2026";
  const account = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname: "材料版本测试作者" },
    })
  ).json();
  const adminAccount = await (
    await page.request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "test-only-admin-2026" },
    })
  ).json();
  const post = await (
    await page.request.post("/api/v1/posts", {
      headers: { Authorization: `Bearer ${account.token}` },
      data: {
        subjectId: "demo-noodle",
        title: "版本关联浏览器测试：虚构经历",
        body: "这是一条用于材料关联第一版正文的虚构经历，后续会更正其中的描述。",
        occurredOn: "2026-01-01",
        anonymous: true,
        personalExperience: true,
      },
    })
  ).json();
  await page.request.post(`/api/v1/admin/reviews/POST/${post.id}/decision`, {
    headers: { Authorization: `Bearer ${adminAccount.token}` },
    data: { action: "APPROVE", reason: "虚构正文审核通过" },
  });
  await login(page, username, password);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 60;
    return canvas.toDataURL("image/png");
  });
  await page.getByRole("link", { name: "我的记录", exact: true }).click();
  await page
    .getByRole("link", { name: "添加 / 管理图片材料", exact: true })
    .click();
  await page
    .getByLabel("选择图片", { exact: true })
    .setInputFiles({
      name: "version.png",
      mimeType: "image/png",
      buffer: Buffer.from(image.split(",")[1], "base64"),
    });
  await page
    .getByLabel("来源与关联说明")
    .fill("版本关联测试：这份虚构材料需要针对正文重新核对。");
  await page.getByRole("button", { name: "上传材料", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "等待审核 · 申请公开" }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const admin = await context.newPage();
    await login(admin, "admin", "test-only-admin-2026");
    await admin.getByRole("link", { name: "内容审核" }).click();
    const material = admin
      .locator(".material-review-item")
      .filter({ hasText: "版本关联浏览器测试" });
    await expect(material).toContainText("本次复核第 1 版");
    await material
      .getByLabel("材料审核说明")
      .fill("仅支持第一版描述，虚构材料通过。");
    await material
      .getByLabel("已检查图片、来源说明的隐私与相关性；公开副本遮挡范围完整。")
      .check();
    await material
      .getByRole("button", { name: "通过并公开副本", exact: true })
      .click();
    await expect(material).toHaveCount(0);
    await page.getByRole("link", { name: "返回我的记录", exact: true }).click();
    await page
      .getByRole("link", { name: "修改原文 / 查看审核", exact: true })
      .click();
    await page
      .getByLabel("经历正文")
      .fill(
        "这是第二版虚构正文，需要重新核对收费说明，旧材料不能未经复核就支持这个版本。",
      );
    await page
      .getByLabel("更正说明", { exact: true })
      .fill("更正具体描述，材料相关性需重新检查。");
    await page.getByRole("button", { name: "提交修改审核" }).click();
    await expect(
      page.getByRole("heading", { name: "修改已提交" }),
    ).toBeVisible();
    await admin.getByRole("link", { name: "发现经历", exact: true }).click();
    await admin.getByRole("link", { name: "内容审核" }).click();
    const revision = admin
      .locator(".review-item")
      .filter({ hasText: "版本关联浏览器测试" });
    await revision
      .getByLabel("审核说明", { exact: true })
      .fill("虚构修订通过，材料需要新版复核。");
    await revision
      .getByRole("button", { name: "通过并公开", exact: true })
      .click();
    await expect(material).toContainText("本次复核第 2 版");
    await material.getByText("阅读本次复核的正文", { exact: true }).click();
    await expect(material).toContainText("这是第二版虚构正文");
    await page.getByRole("link", { name: "返回公开记录", exact: true }).click();
    await expect(page.locator(".detail-header .tag")).toHaveText("仅本人陈述");
    await expect(page.locator(".detail-page > .public-materials")).toHaveCount(
      0,
    );
    await page.locator(".revision-history > summary").click();
    const first = page
      .locator(".revision-history article")
      .filter({ hasText: "第 1 版" });
    await first.getByText("阅读此版本", { exact: true }).click();
    await expect(first.locator(".public-materials")).toContainText(
      "对应第 1 版",
    );
    await expect(first.locator("img")).toBeVisible();
    await material
      .getByLabel("材料审核说明")
      .fill("重新阅读第二版后，确认材料仍相关，隐私检查通过。");
    await material
      .getByLabel("已检查图片、来源说明的隐私与相关性；公开副本遮挡范围完整。")
      .check();
    await material
      .getByRole("button", { name: "通过并公开副本", exact: true })
      .click();
    await expect(material).toHaveCount(0);
    await page.getByRole("link", { name: "发现经历", exact: true }).click();
    await page
      .getByRole("link", { name: /版本关联浏览器测试：虚构经历/ })
      .click();
    await expect(page.locator(".detail-header .tag")).toHaveText("已附材料");
    await expect(
      page.locator(".detail-page > .public-materials"),
    ).toContainText("对应第 2 版");
    await page.screenshot({
      path: "test-results/material-version-review.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
