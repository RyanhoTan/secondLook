import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("finds empty objects and distinct branches with shareable filters and pagination", async ({
  page,
}) => {
  const account = await (
    await page.request.post("/api/v1/auth/register", {
      data: {
        username: `objects_${Date.now()}`,
        nickname: "虚构对象测试",
        password: "test-only-objects-2026",
      },
    })
  ).json();
  const headers = { Authorization: `Bearer ${account.token}` };
  const name = `虚构同名对象-${Date.now()}`;
  const ids: string[] = [];
  for (const [city, category, address] of [
    ["测试东城", "RESTAURANT", "虚构东路 8 号"],
    ["测试西城", "RESTAURANT", "虚构西路 9 号"],
    ["测试东城", "OTHER", "虚构东路 10 号"],
  ]) {
    const res = await page.request.post("/api/v1/subjects", {
      headers,
      data: { name, city, category, address },
    });
    expect(res.status()).toBe(201);
    ids.push((await res.json()).id);
  }
  const pending = await page.request.post("/api/v1/posts", {
    headers,
    data: {
      subjectId: ids[0],
      clientKey: randomUUID(),
      title: "对象目录不显示待审记录",
      body: "这是一条虚构的未审核记录，目录不得泄漏其正文或将其计入公开经历数量。",
      occurredOn: "2026-01-01",
      anonymous: true,
      personalExperience: true,
      issueTypes: ["TASTE"],
    },
  });
  expect(pending.status()).toBe(201);
  await page.goto(`/objects?q=${encodeURIComponent(name)}&limit=1`);
  await expect(page.locator(".subject-row")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "对象检索分页" }),
  ).toContainText("第 1 / 3 页");
  await expect(page.getByText("暂无公开经历", { exact: true })).toBeVisible();
  const first = await page.locator(".subject-identity a").getAttribute("href");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".subject-identity a")).not.toHaveAttribute(
    "href",
    first!,
  );
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "对象检索分页" }),
  ).toContainText("第 2 / 3 页");
  await page.locator(".subject-identity a").click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByLabel("搜索对象名称或门店地址")).toHaveValue(name);
  await page.getByLabel("对象所在城市").fill("测试东城");
  await page
    .getByRole("group", { name: "对象分类" })
    .getByRole("button", { name: "饭店", exact: true })
    .click();
  await expect(page.locator(".subject-row")).toHaveCount(1);
  await expect(page.locator(".subject-row")).toContainText("虚构东路 8 号");
  await expect(page.locator(".subject-row")).toContainText("暂无公开经历");
  await expect(
    page.getByText("对象目录不显示待审记录", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("对象所在城市").fill("");
  await page.getByLabel("搜索对象名称或门店地址").fill("虚构西路 9 号");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await expect(page.locator(".subject-row")).toContainText("测试西城");
  await page.getByLabel("搜索对象名称或门店地址").fill("没有这个虚构对象000");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await expect(
    page.getByText("没有找到对象，试试其他名称、地址或城市。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除条件", exact: true }).click();
  await expect(page.getByLabel("搜索对象名称或门店地址")).toHaveValue("");
  await expect(page.locator(".subject-row").first()).toBeVisible();
  await page.getByLabel("搜索对象名称或门店地址").fill("尚未应用的输入");
  await page.getByRole("button", { name: "清除条件", exact: true }).click();
  await expect(page.getByLabel("搜索对象名称或门店地址")).toHaveValue("");
});

test("transfers common discovery filters and recovers an invalid or failed object lookup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "饭店", exact: true }).click();
  await page.getByLabel("搜索公司、饭店、景点或经历").fill("山间面馆");
  await page.getByLabel("筛选城市", { exact: true }).fill("杭州");
  await page.getByRole("link", { name: "查找具体对象" }).click();
  await expect(page).toHaveURL(/objects\?/);
  await expect(page.getByLabel("搜索对象名称或门店地址")).toHaveValue(
    "山间面馆",
  );
  await expect(page.getByLabel("对象所在城市")).toHaveValue("杭州");
  await expect(page.locator(".subject-row")).toHaveCount(1);
  await page.goto("/objects?page=0");
  await expect(page.getByRole("button", { name: "重试查找" })).toBeVisible();
  await page.getByRole("button", { name: "清除条件", exact: true }).click();
  await expect(page.locator(".subject-row").first()).toBeVisible();
  await page.route("**/api/v1/subjects?*", (route) => route.abort());
  await page.getByLabel("搜索对象名称或门店地址").fill("山间面馆");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试查找" })).toBeVisible();
  await page.unroute("**/api/v1/subjects?*");
  await page.getByRole("button", { name: "重试查找" }).click();
  await expect(page.locator(".subject-row")).toHaveCount(1);
});

test("object lookup remains readable in both themes, narrow screens and enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/objects?q=山间面馆");
  await expect(page.locator(".subject-row")).toHaveCount(1);
  for (const [theme, label] of [
    ["light", "浅色模式"],
    ["dark", "深色模式"],
  ]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const ratios = await page.evaluate(() => {
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
      return [".subject-count", ".subject-address", ".subject-identity h3"].map(
        (selector) => {
          const element = document.querySelector(selector)!;
          let parent: Element | null = element;
          let background = "";
          while (parent) {
            background = getComputedStyle(parent).backgroundColor;
            if (
              background !== "rgba(0, 0, 0, 0)" &&
              background !== "transparent"
            )
              break;
            parent = parent.parentElement;
          }
          const values = [
            luminance(getComputedStyle(element).color),
            luminance(background),
          ].sort((a, b) => a - b);
          return (values[1] + 0.05) / (values[0] + 0.05);
        },
      );
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/objects-${theme}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.getByRole("button", { name: /^外观：/ }).click();
  await page.getByRole("button", { name: "跟随系统", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const selector of [
    ".category-tabs button",
    ".search-submit",
    ".subject-identity a",
    ".object-toolbar .text-button",
    ".city-filter input",
  ]) {
    for (const target of await page.locator(selector).all())
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByLabel("搜索对象名称或门店地址").focus();
  await expect(page.getByLabel("搜索对象名称或门店地址")).toBeFocused();
  expect(
    await page
      .getByLabel("搜索对象名称或门店地址")
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.locator(".subject-row")).toHaveCount(1);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".subject-row")
    .screenshot({ path: "test-results/objects-enlarged.png" });
  await page.locator(".subject-identity a").click();
  await expect(
    page.getByRole("heading", { name: "示例 · 山间面馆", exact: true }),
  ).toBeVisible();
});
