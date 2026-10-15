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
