import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueSession, tokenHash } from "../src/auth.js";
import { reviewItem } from "../src/posts.js";
import { reviewRevision } from "../src/revisions.js";
import { uploadMaterial, reviewMaterial } from "../src/materials.js";
import { MaterialFiles } from "../src/material-files.js";

const dir = mkdtempSync(join(tmpdir(), "secondlook-review-notices-"));
const db = openDatabase(`file:${join(dir, "test.db")}`),
  files = new MaterialFiles(join(dir, "uploads")),
  app = createApp(db, { uploadRoot: files.root });
let admin: string,
  adminId: string,
  other: string,
  otherId: string,
  owner: string,
  ownerId: string,
  subjectId: string,
  image: Buffer;
const auth = (token = owner) => ({ Authorization: `Bearer ${token}` });
const list = (query = "", token = owner) =>
  request(app).get(`/api/v1/me/review-notifications${query}`).set(auth(token));
async function post(status = "PENDING", title = "虚构审核通知的亲历") {
  return db.post.create({
    data: {
      authorId: ownerId,
      subjectId,
      title,
      body: "虚构亲历正文，不涉及真实人物或对象。",
      occurredOn: "2024-01-01",
      anonymous: true,
      status,
    },
  });
}
const decide = (
  kind: string,
  id: string,
  action = "APPROVE",
  reason = "仅本人可见的审核说明",
) =>
  request(app)
    .post(`/api/v1/admin/reviews/${kind}/${id}/decision`)
    .set(auth(admin))
    .send({ action, reason });
beforeAll(async () => {
  execFileSync(
    process.execPath,
    [resolve("../../node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: `file:${join(dir, "test.db")}` },
      stdio: "pipe",
    },
  );
  for (const name of ["admin", "other"]) {
    const u = await db.user.create({
      data: {
        username: `rn_${name}`,
        nickname: "内部昵称",
        passwordHash: "unused-test-only",
        role: name === "admin" ? "ADMIN" : "USER",
      },
    });
    const token = await issueSession(db, u.id);
    if (name === "admin") {
      admin = token;
      adminId = u.id;
    } else {
      other = token;
      otherId = u.id;
    }
  }
  subjectId = (
    await db.subject.create({
      data: { name: "审核通知虚构对象", category: "OTHER", city: "测试市" },
    })
  ).id;
  image = await sharp({
    create: { width: 100, height: 60, channels: 3, background: "#aaaaaa" },
  })
    .png()
    .toBuffer();
}, 30000);
beforeEach(async () => {
  const u = await db.user.create({
    data: {
      username: randomUUID(),
      nickname: "匿名作者内部昵称",
      passwordHash: "unused-test-only",
    },
  });
  ownerId = u.id;
  owner = await issueSession(db, u.id);
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

it("notifies the author once for both post decisions without exposing rejection reasons to followers or public timelines", async () => {
  for (const action of ["APPROVE", "REJECT"]) {
    const p = await post();
    await db.follow.create({ data: { userId: otherId, postId: p.id } });
    await db.follow.create({ data: { userId: ownerId, postId: p.id } });
    expect((await decide("POST", p.id, action)).status).toBe(204);
    expect((await decide("POST", p.id, action)).status).toBe(409);
    const rows = await db.reviewNotification.findMany({
      where: { targetId: p.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: ownerId,
      decision: action,
      version: 1,
    });
    expect(
      await db.auditLog.findUnique({ where: { id: rows[0].auditId } }),
    ).toMatchObject({
      targetId: p.id,
      action: `POST_${action}`,
      reason: "仅本人可见的审核说明",
    });
    const publicData = await request(app).get(`/api/v1/posts/${p.id}`);
    if (action === "APPROVE") expect(publicData.status).toBe(200);
    else expect(publicData.status).toBe(404);
    expect(JSON.stringify(publicData.body)).not.toContain(
      "仅本人可见的审核说明",
    );
    expect(await db.timelineEvent.count({ where: { postId: p.id } })).toBe(
      action === "APPROVE" ? 1 : 0,
    );
  }
  expect((await list()).body.total).toBe(2);
  expect((await list("", other)).body.total).toBe(0);
  expect(
    (await request(app).get("/api/v1/me/notifications").set(auth(other))).body
      .total,
  ).toBe(1);
  expect(
    (await request(app).get("/api/v1/me/notifications").set(auth())).body.total,
  ).toBe(1);
});

it("sends private progress and revision decisions including rejected proposed text and its base version", async () => {
  for (const action of ["APPROVE", "REJECT"]) {
    const p = await post("PUBLISHED");
    const u = await db.progressUpdate.create({
      data: { postId: p.id, title: "虚构私有进展标题", body: "虚构进展正文" },
    });
    expect((await decide("UPDATE", u.id, action)).status).toBe(204);
    expect((await decide("UPDATE", u.id, action)).status).toBe(409);
    const r = await db.postRevision.create({
      data: {
        postId: p.id,
        pendingKey: p.id,
        baseVersion: 1,
        title: "虚构未公开修订标题",
        body: "虚构修订正文",
        occurredOn: "2024-01-01",
        changeReason: "更正虚构描述",
      },
    });
    expect((await decide("REVISION", r.id, action)).status).toBe(204);
    expect((await decide("REVISION", r.id, action)).status).toBe(409);
    expect(
      await db.reviewNotification.count({ where: { targetId: r.id } }),
    ).toBe(1);
  }
  const result = (await list()).body;
  expect(result.total).toBe(4);
  expect(
    result.items
      .filter((n: { kind: string }) => n.kind === "REVISION")
      .every((n: { version: number }) => n.version === 1),
  ).toBe(true);
  expect(
    result.items.some(
      (n: { title: string; decision: string }) =>
        n.title === "虚构未公开修订标题" && n.decision === "REJECT",
    ),
  ).toBe(true);
  expect((await list("", other)).body.items).toEqual([]);
});

it("notifies material decisions privately for either visibility and again for a new body version", async () => {
  const p = await post();
  let first = "";
  for (const visibility of ["PUBLIC", "REVIEW_ONLY"] as const)
    for (const action of ["APPROVE", "REJECT"] as const) {
      const m = await uploadMaterial(
        db,
        files,
        p.id,
        ownerId,
        { clientKey: randomUUID(), source: "虚构材料通知来源说明", visibility },
        image,
      );
      if (!first) first = m.id;
      const data = {
        action,
        reason: "私有材料审核决定",
        privacyChecked: true,
        redactions: [],
        baseVersion: 1,
      };
      await reviewMaterial(db, files, m.id, adminId, data);
      await expect(
        reviewMaterial(db, files, m.id, adminId, data),
      ).rejects.toThrow();
      expect(
        await db.reviewNotification.count({ where: { targetId: m.id } }),
      ).toBe(1);
    }
  expect((await list()).body.total).toBe(4);
  expect(
    await db.notification.count({ where: { event: { postId: p.id } } }),
  ).toBe(0);
  expect(
    (await request(app).get(`/api/v1/posts/${p.id}/materials`)).status,
  ).toBe(404);
  expect((await decide("POST", p.id)).status).toBe(204);
  const r = await db.postRevision.create({
    data: {
      postId: p.id,
      pendingKey: p.id,
      baseVersion: 1,
      title: "虚构第二版",
      body: "虚构第二版正文",
      occurredOn: "2024-01-01",
      changeReason: "虚构更正原因",
    },
  });
  expect((await decide("REVISION", r.id)).status).toBe(204);
  await reviewMaterial(db, files, first, adminId, {
    action: "REJECT",
    reason: "新版相关性不足",
    privacyChecked: false,
    redactions: [],
    baseVersion: 2,
  });
  const notices = await db.reviewNotification.findMany({
    where: { targetId: first },
    orderBy: { version: "asc" },
  });
  expect(notices.map((n) => [n.version, n.decision])).toEqual([
    [1, "APPROVE"],
    [2, "REJECT"],
  ]);
});

it("protects private DTOs, read endpoints, cache headers, invalid queries and expired sessions", async () => {
  const p = await post();
  await decide("POST", p.id, "REJECT");
  expect(
    (await request(app).get("/api/v1/me/review-notifications?page=bad")).status,
  ).toBe(401);
  const result = await list(`?userId=${otherId}`);
  expect(result.headers["cache-control"]).toContain("no-store");
  expect(result.body.total).toBe(1);
  const n = result.body.items[0];
  expect(Object.keys(n).sort()).toEqual(
    [
      "id",
      "postId",
      "targetId",
      "kind",
      "version",
      "decision",
      "title",
      "reason",
      "read",
      "createdAt",
      "postAvailable",
    ].sort(),
  );
  expect(n.postAvailable).toBe(false);
  expect(JSON.stringify(n)).not.toContain(ownerId);
  expect(JSON.stringify(n)).not.toContain(adminId);
  for (const token of [other, admin]) {
    expect((await list("", token)).body.total).toBe(0);
    expect(
      (
        await request(app)
          .patch(`/api/v1/review-notifications/${n.id}/read`)
          .set(auth(token))
      ).status,
    ).toBe(404);
  }
  expect(
    (await request(app).patch(`/api/v1/notifications/${n.id}/read`).set(auth()))
      .status,
  ).toBe(404);
  for (const q of [
    "?page=0",
    "?limit=51",
    "?page=1&page=2",
    "?limit=12&limit=13",
  ])
    expect((await list(q)).status).toBe(400);
  await db.session.update({
    where: { tokenHash: tokenHash(owner) },
    data: { expiresAt: new Date(0) },
  });
  expect((await list()).status).toBe(401);
  expect(
    (
      await request(app)
        .patch(`/api/v1/review-notifications/${n.id}/read`)
        .set(auth())
    ).status,
  ).toBe(401);
});

it("paginates more than one hundred private results, keeps read order and distinguishes current public availability", async () => {
  const p = await post("PUBLISHED");
  await db.auditLog.createMany({
    data: Array.from({ length: 121 }, (_, i) => ({
      id: `rn-audit-${i}`,
      actorId: adminId,
      targetId: `fixture-${i}`,
      action: "POST_REJECT",
      reason: "虚构审核通知夹具",
    })),
  });
  await db.reviewNotification.createMany({
    data: Array.from({ length: 121 }, (_, i) => ({
      id: `rn-${String(i).padStart(3, "0")}`,
      userId: ownerId,
      postId: p.id,
      auditId: `rn-audit-${i}`,
      targetId: `fixture-${i}`,
      kind: "POST",
      version: 1,
      decision: "REJECT",
      title: `虚构审核通知 ${i}`,
      reason: "虚构说明",
      createdAt: new Date("2024-01-01"),
    })),
  });
  const all: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = await list(`?page=${page}&limit=50`);
    expect(result.body.total).toBe(121);
    all.push(...result.body.items.map((n: { id: string }) => n.id));
  }
  expect(all).toHaveLength(121);
  expect(new Set(all).size).toBe(121);
  expect(all[0]).toBe("rn-120");
  expect((await list("?page=4&limit=50")).body).toMatchObject({
    total: 121,
    items: [],
  });
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request(app)
          .patch("/api/v1/review-notifications/rn-000/read")
          .set(auth())
      ).status,
    ).toBe(204);
  const last = (await list("?page=3&limit=50")).body;
  expect(last.items.at(-1)).toMatchObject({
    id: "rn-000",
    read: true,
    postAvailable: true,
  });
  await db.post.update({ where: { id: p.id }, data: { status: "LIMITED" } });
  const restricted = (await list("?page=3&limit=50")).body;
  expect(restricted.total).toBe(121);
  expect(
    restricted.items.every((n: { postAvailable: boolean }) => !n.postAvailable),
  ).toBe(true);
  expect(
    (await request(app).get("/api/v1/me/notifications").set(auth())).body.total,
  ).toBe(0);
});

function failTransactionModel(model: "reviewNotification" | "timelineEvent") {
  const original = db.$transaction.bind(db);
  return vi.spyOn(db, "$transaction").mockImplementationOnce(((
    fn: (tx: unknown) => unknown,
  ) =>
    original(async (tx) =>
      fn(
        new Proxy(tx, {
          get(target, prop) {
            if (prop === model)
              return {
                ...target[model],
                create: () => {
                  throw new Error("simulated notice transaction failure");
                },
              };
            return Reflect.get(target, prop);
          },
        }),
      ),
    )) as typeof db.$transaction);
}
it("rolls back text, versions, audits and material files when private notification storage fails", async () => {
  for (const kind of ["POST", "UPDATE", "REVISION", "MATERIAL"] as const) {
    const p = await post(kind === "POST" ? "PENDING" : "PUBLISHED");
    let id = p.id;
    if (kind === "UPDATE")
      id = (
        await db.progressUpdate.create({
          data: { postId: p.id, title: "虚构进展", body: "虚构正文" },
        })
      ).id;
    if (kind === "REVISION")
      id = (
        await db.postRevision.create({
          data: {
            postId: p.id,
            pendingKey: p.id,
            baseVersion: 1,
            title: "虚构更正",
            body: "虚构更正正文",
            occurredOn: "2024-01-01",
            changeReason: "虚构原因",
          },
        })
      ).id;
    if (kind === "MATERIAL")
      id = (
        await uploadMaterial(
          db,
          files,
          p.id,
          ownerId,
          {
            clientKey: randomUUID(),
            source: "虚构回滚来源说明",
            visibility: "PUBLIC",
          },
          image,
        )
      ).id;
    const before = readdirSync(files.root).length,
      spy = failTransactionModel("reviewNotification");
    try {
      const call =
        kind === "REVISION"
          ? reviewRevision(db, id, "APPROVE", "虚构审核", adminId)
          : kind === "MATERIAL"
            ? reviewMaterial(db, files, id, adminId, {
                action: "APPROVE",
                reason: "虚构审核",
                privacyChecked: true,
                redactions: [],
                baseVersion: 1,
              })
            : reviewItem(db, id, kind, "APPROVE", "虚构审核", adminId);
      await expect(call).rejects.toThrow(
        "simulated notice transaction failure",
      );
    } finally {
      spy.mockRestore();
    }
    expect(await db.reviewNotification.count({ where: { postId: p.id } })).toBe(
      0,
    );
    expect(await db.auditLog.count({ where: { targetId: id } })).toBe(0);
    expect(await db.timelineEvent.count({ where: { postId: p.id } })).toBe(0);
    expect(
      (await db.post.findUniqueOrThrow({ where: { id: p.id } })).currentVersion,
    ).toBe(1);
    if (kind === "POST")
      expect((await db.post.findUniqueOrThrow({ where: { id } })).status).toBe(
        "PENDING",
      );
    if (kind === "UPDATE")
      expect(
        (await db.progressUpdate.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("PENDING");
    if (kind === "REVISION")
      expect(
        (await db.postRevision.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("PENDING");
    if (kind === "MATERIAL") {
      expect(
        (await db.material.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("PENDING");
      expect(readdirSync(files.root).length).toBe(before);
      expect(
        (
          await db.materialVersion.findUniqueOrThrow({
            where: { materialId_version: { materialId: id, version: 1 } },
          })
        ).status,
      ).toBe("PENDING");
    }
  }
});
it("rolls back an already-written private result when later public publication fails", async () => {
  const p = await post(),
    spy = failTransactionModel("timelineEvent");
  try {
    await expect(
      reviewItem(db, p.id, "POST", "APPROVE", "虚构审核", adminId),
    ).rejects.toThrow("simulated notice transaction failure");
  } finally {
    spy.mockRestore();
  }
  expect(await db.reviewNotification.count({ where: { postId: p.id } })).toBe(
    0,
  );
  expect(
    (await db.post.findUniqueOrThrow({ where: { id: p.id } })).status,
  ).toBe("PENDING");
  expect(await db.postRevision.count({ where: { postId: p.id } })).toBe(0);
});
