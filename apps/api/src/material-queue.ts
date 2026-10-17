import {
  formatOccurrence,
  publicOccurrence,
  type MaterialReview,
  type MaterialQueueQuery,
  type Page,
} from "@secondlook/contracts";
import type { Database } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";
import { ownMaterial } from "./materials.js";

export const materialReviewInclude = {
  post: { include: { subject: true } },
} as const;
type Row = Prisma.MaterialGetPayload<{ include: typeof materialReviewInclude }>;
export function materialReviewDto(item: Row): MaterialReview {
  if (item.visibility !== "PUBLIC" && item.visibility !== "REVIEW_ONLY")
    throw new Error("材料公开范围无效");
  return {
    ...ownMaterial(item),
    visibility: item.visibility,
    postId: item.postId,
    postTitle: item.post.title,
    subjectName: item.post.subject.name,
    postBody: item.post.body,
    postOccurrenceLabel: formatOccurrence(publicOccurrence(item.post)),
  };
}
const from = `FROM Material m JOIN Post p ON p.id=m.postId JOIN Subject s ON s.id=p.subjectId
 WHERE m.status IN ('PENDING','NEEDS_REVIEW') AND p.status IN ('PENDING','PUBLISHED')
 AND (?='ALL' OR m.status=?) AND (?='ALL' OR m.visibility=?)
 AND (?='' OR instr(lower(m.source),lower(?))>0 OR instr(lower(p.title),lower(?))>0
 OR instr(lower(p.body),lower(?))>0 OR instr(lower(s.name),lower(?))>0)`;
export async function materialQueue(
  db: Database,
  query: MaterialQueueQuery,
): Promise<Page<MaterialReview>> {
  return db.$transaction(async (tx) => {
    const args = [
      query.status,
      query.status,
      query.visibility,
      query.visibility,
      query.q,
      query.q,
      query.q,
      query.q,
      query.q,
    ];
    const [ids, totals] = await Promise.all([
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT m.id ${from}
        ORDER BY CASE WHEN typeof(m.createdAt) IN ('integer','real') THEN m.createdAt
        ELSE ROUND((julianday(m.createdAt)-2440587.5)*86400000) END ASC,m.id ASC LIMIT ? OFFSET ?`,
        ...args,
        query.limit,
        (query.page - 1) * query.limit,
      ),
      tx.$queryRawUnsafe<{ count: bigint | number }[]>(
        `SELECT COUNT(*) AS count ${from}`,
        ...args,
      ),
    ]);
    const rows = await tx.material.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: materialReviewInclude,
    });
    const mapped = new Map(rows.map((row) => [row.id, materialReviewDto(row)]));
    return {
      items: ids.map((row) => {
        const item = mapped.get(row.id);
        if (!item) throw new Error("材料审核队列读取不一致，请重试");
        return item;
      }),
      total: Number(totals[0].count),
      page: query.page,
    };
  });
}
