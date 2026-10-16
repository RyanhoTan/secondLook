import { test, expect, type Page } from "@playwright/test";

async function compose(page: Page, suffix: string) {
  const username = `preview_${suffix}_${Date.now()}`,
    password = "test-only-preview-2026",
    nickname = "预览测试公开昵称";
  const registered = await (
    await page.request.post("/api/v1/auth/register", {
      data: { username, password, nickname },
    })
  ).json();
  await page.goto("/login");
  await page.getByLabel("登录名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("link", { name: "记录一次经历", exact: true }).click();
  await page.getByLabel("搜索对象名称或门店地址").fill("山间面馆");
  await page.getByRole("button", { name: "查找对象", exact: true }).click();
  await page.getByLabel("选择对象").selectOption("demo-noodle");
  await page.getByRole("checkbox", { name: "收费说明", exact: true }).check();
  await page
    .getByLabel("用一句话概括")
    .fill("  预览测试：虚构经历与公开身份  ");
  await page.getByLabel("发生日期", { exact: true }).fill("2026-01-01");
  await page
    .getByLabel("说说你的亲身经历")
    .fill(
      "  这是一条用于发布前预览的虚构经历，包含换行和文本标签。\n<script>虚构文字不会作为代码运行</script>\n这是完整正文的最后一行。  ",
    );
  await page.getByLabel("确认这是我的亲身经历，并愿意补充后续。").check();
  return { token: registered.token as string, nickname };
}

test("previews exact public identity and full text without posting, then returns to preserved inputs", async ({
  page,
}) => {
  const { token, nickname } = await compose(page, "identity");
  let submissions = 0;
  await page.route("**/api/v1/me/drafts/*/submit", (route) => {
    submissions++;
    return route.continue();
  });
  await page.getByRole("button", { name: "预览发布内容", exact: true }).click();
  const preview = page.getByRole("region", { name: "发布前预览", exact: true });
  await expect(
    preview.getByRole("heading", { name: "发布前预览", exact: true }),
  ).toBeFocused();
  expect(
    (await preview
      .getByRole("heading", { name: "发布前预览", exact: true })
      .boundingBox())!.y,
  ).toBeGreaterThanOrEqual(
    (await page.locator(".global-header").boundingBox())!.height,
  );
  await expect(preview).toContainText("示例 · 山间面馆");
  await expect(preview).toContainText("虚构路 12 号");
  await expect(preview).toContainText("饭店 · 杭州");
  await expect(preview).toContainText("发生日期：2026-01-01");
  await expect(preview.locator(".preview-identity")).toHaveText(
    "对外身份：匿名亲历者",
  );
  await expect(preview).not.toContainText(nickname);
  await expect(preview.locator(".issue-types")).toContainText("收费说明");
  await expect(preview.locator(".preview-body")).toHaveText(
    "这是一条用于发布前预览的虚构经历，包含换行和文本标签。\n<script>虚构文字不会作为代码运行</script>\n这是完整正文的最后一行。",
  );
  expect(submissions).toBe(0);
  expect(
    (
      await (
        await page.request.get("/api/v1/me/posts", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
    ).total,
  ).toBe(0);
  await preview.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(page.getByLabel("用一句话概括")).toBeFocused();
  await expect(page.getByLabel("用一句话概括")).toHaveValue(
    "预览测试：虚构经历与公开身份",
  );
  await expect(page.getByLabel("说说你的亲身经历")).toHaveValue(
    /这是完整正文的最后一行。/,
  );
  await page.getByLabel("对外匿名发布").uncheck();
  await page.getByLabel("用一句话概括").fill("返回后修正的虚构预览标题");
  await page.getByRole("button", { name: "预览发布内容", exact: true }).click();
  await expect(preview.locator(".preview-identity")).toHaveText(
    `对外身份：${nickname}`,
  );
  await expect(
    preview.getByRole("heading", {
      name: "返回后修正的虚构预览标题",
      exact: true,
    }),
  ).toBeVisible();
  await preview
    .getByRole("button", { name: "提交审核", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "感谢你，多留一份依据。" }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  const own = await (
    await page.request.get("/api/v1/me/posts", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  expect(own.total).toBe(1);
  expect(own.items[0].title).toBe("返回后修正的虚构预览标题");
});

test("stops final submission when another editor has changed the previewed draft", async ({
  page,
}) => {
  const { token } = await compose(page, "conflict");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".draft-actions [role=status]")).toContainText(
    "草稿已保存",
  );
  await page.getByRole("button", { name: "预览发布内容", exact: true }).click();
  const id = new URL(page.url()).searchParams.get("draft")!;
  const headers = { Authorization: `Bearer ${token}` };
  const old = await (
    await page.request.get(`/api/v1/me/drafts/${id}`, { headers })
  ).json();
  const peer = await page.request.put(`/api/v1/me/drafts/${id}`, {
    headers,
    data: {
      ...old,
      title: "另一窗口保存的虚构标题",
      mutationKey: crypto.randomUUID(),
    },
  });
  expect(peer.status()).toBe(200);
  await page
    .getByRole("region", { name: "发布前预览" })
    .getByRole("button", { name: "提交审核", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/草稿.*(变化|修改)/);
  expect(
    (await (await page.request.get("/api/v1/me/posts", { headers })).json())
      .total,
  ).toBe(0);
  await expect(
    page.getByRole("region", { name: /发布前预览|确认投稿结果/ }),
  ).toContainText("预览测试：虚构经历与公开身份");
});

test("preview stays readable with themes, keyboard, narrow screens and enlarged text", async ({
  page,
}) => {
  await compose(page, "layout");
  await page.getByRole("button", { name: "预览发布内容", exact: true }).click();
  for (const label of ["浅色模式", "深色模式"]) {
    await page.getByRole("button", { name: /^外观：/ }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".appearance-options")).toHaveCount(0);
    const ratios = await page.locator(".post-preview").evaluate((surface) => {
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
      const bg = luminance(getComputedStyle(surface).backgroundColor);
      return [".preview-body", ".preview-identity", ".small-note"].map(
        (selector) => {
          const ink = luminance(
            getComputedStyle(surface.querySelector(selector)!).color,
          );
          return (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05);
        },
      );
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/post-preview-${label}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const button of await page.locator(".post-preview button").all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page
    .locator(".preview-identity")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .locator(".preview-identity")
    .screenshot({ path: "test-results/post-preview-identity-enlarged.png" });
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  await expect(page.getByLabel("用一句话概括")).toBeFocused();
});
