import {
  publicOccurrence,
  type Review,
  type ReviewQueueQuery,
  type ReviewQueuePage,
} from "@secondlook/contracts";
import type { Database } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";
import { postIssues, storedIssues } from "./issues.js";

export const reviewPostInclude = { subject: true, issues: true } as const;
export const reviewLinkedInclude = {
  post: { include: reviewPostInclude },
} as const;
type PostRow = Prisma.PostGetPayload<{ include: typeof reviewPostInclude }>;
type UpdateRow = Prisma.ProgressUpdateGetPayload<{
  include: typeof reviewLinkedInclude;
}>;
type RevisionRow = Prisma.PostRevisionGetPayload<{
  include: typeof reviewLinkedInclude;
}>;
export function reviewDtos(
  posts: PostRow[],
  updates: UpdateRow[],
  revisions: RevisionRow[],
): Review[] {
  return [
    ...posts.map((p): Review => ({
      id: p.id,
      title: p.title,
      body: p.body,
      kind: "POST",
      ...publicOccurrence(p),
      issueTypes: postIssues(p.issues),
      subjectName: p.subject.name,
      createdAt: p.createdAt.toISOString(),
    })),
    ...updates.map((u): Review => ({
      id: u.id,
      title: u.title,
      body: u.body,
      kind: "UPDATE",
      subjectName: u.post.subject.name,
      createdAt: u.createdAt.toISOString(),
    })),
    ...revisions.map((r): Review => ({
      id: r.id,
      title: r.title,
      body: r.body,
      kind: "REVISION",
      issueTypes: storedIssues(r.issueTypes),
      changeReason: r.changeReason,
      ...publicOccurrence(r),
      subjectName: r.post.subject.name,
      createdAt: r.createdAt.toISOString(),
      previous: {
        title: r.post.title,
        body: r.post.body,
        ...publicOccurrence(r.post),
        version: r.post.currentVersion,
        issueTypes: postIssues(r.post.issues),
      },
    })),
  ];
}

// Fixed SQL identifiers and parameter-bound inputs. Normalize SQLite DEFAULT timestamps and Prisma milliseconds.
const queuedAt = (alias: string) =>
  `CASE WHEN typeof(${alias}.createdAt) IN ('integer','real') THEN ${alias}.createdAt ELSE ROUND((julianday(${alias}.createdAt) - 2440587.5) * 86400000) END`;
const pending = `
 SELECT 'POST' AS kind, p.id, ${queuedAt("p")} AS queuedAt, p.title, p.body, s.name AS subjectName
 FROM Post p JOIN Subject s ON s.id=p.subjectId WHERE p.status='PENDING'
 UNION ALL
 SELECT 'UPDATE', u.id, ${queuedAt("u")}, u.title, u.body, s.name
 FROM ProgressUpdate u JOIN Post p ON p.id=u.postId JOIN Subject s ON s.id=p.subjectId
 WHERE u.status='PENDING' AND p.status='PUBLISHED'
 UNION ALL
 SELECT 'REVISION', r.id, ${queuedAt("r")}, r.title, r.body, s.name
 FROM PostRevision r JOIN Post p ON p.id=r.postId JOIN Subject s ON s.id=p.subjectId
 WHERE r.status='PENDING' AND p.status='PUBLISHED'
`;
const matches = `(?='' OR instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0 OR instr(lower(subjectName),lower(?))>0)`;
export async function reviewQueue(
  db: Database,
  query: ReviewQueueQuery,
): Promise<ReviewQueuePage> {
  return db.$transaction(async (tx) => {
    const args = [query.q, query.q, query.q, query.q];
    const [ids, totals] = await Promise.all([
      tx.$queryRawUnsafe<{ kind: Review["kind"]; id: string }[]>(
        `SELECT kind,id FROM (${pending}) WHERE ${matches} AND (?='ALL' OR kind=?) ORDER BY queuedAt ASC,kind ASC,id ASC LIMIT ? OFFSET ?`,
        ...args,
        query.kind,
        query.kind,
        query.limit,
        (query.page - 1) * query.limit,
      ),
      tx.$queryRawUnsafe<{ kind: Review["kind"]; count: bigint | number }[]>(
        `SELECT kind,COUNT(*) AS count FROM (${pending}) WHERE ${matches} GROUP BY kind`,
        ...args,
      ),
    ]);
    const counts: ReviewQueuePage["counts"] = {
      ALL: 0,
      POST: 0,
      UPDATE: 0,
      REVISION: 0,
    };
    for (const total of totals) {
      counts[total.kind] = Number(total.count);
      counts.ALL += Number(total.count);
    }
    const ofKind = (kind: Review["kind"]) =>
      ids.filter((row) => row.kind === kind).map((row) => row.id);
    const [posts, updates, revisions] = await Promise.all([
      tx.post.findMany({
        where: { id: { in: ofKind("POST") } },
        include: reviewPostInclude,
      }),
      tx.progressUpdate.findMany({
        where: { id: { in: ofKind("UPDATE") } },
        include: reviewLinkedInclude,
      }),
      tx.postRevision.findMany({
        where: { id: { in: ofKind("REVISION") } },
        include: reviewLinkedInclude,
      }),
    ]);
    const mapped = new Map(
      reviewDtos(posts, updates, revisions).map((item) => [
        `${item.kind}:${item.id}`,
        item,
      ]),
    );
    return {
      items: ids.map((row) => {
        const item = mapped.get(`${row.kind}:${row.id}`);
        if (!item) throw new Error("审核队列读取不一致，请重试");
        return item;
      }),
      total: counts[query.kind],
      counts,
      page: query.page,
    };
  });
}
