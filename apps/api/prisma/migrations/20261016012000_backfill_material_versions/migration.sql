-- Earlier uploads did not record a submission version. Preserve that uncertainty.
UPDATE "Material" SET "reviewVersion" = (SELECT "currentVersion" FROM "Post" WHERE "Post"."id" = "Material"."postId");
INSERT INTO "MaterialVersion" ("id", "materialId", "version", "status", "publicKey", "reason", "reviewedAt")
SELECT m."id" || ':legacy-version', m."id", m."reviewVersion",
  CASE WHEN m."reviewVersion" > 1 AND m."status" IN ('APPROVED', 'PENDING') THEN 'PENDING' ELSE m."status" END,
  CASE WHEN m."reviewVersion" = 1 AND m."status" = 'APPROVED' THEN m."publicKey" ELSE NULL END,
  CASE WHEN m."reviewVersion" > 1 AND m."status" IN ('APPROVED', 'PENDING') THEN '旧材料未记录对应版本，请对当前正文重新复核' ELSE m."reason" END,
  CASE WHEN m."reviewVersion" = 1 THEN m."reviewedAt" ELSE NULL END
FROM "Material" m;
UPDATE "Material" SET "status" = 'NEEDS_REVIEW', "reason" = '旧材料未记录对应版本，请对当前正文重新复核'
WHERE "reviewVersion" > 1 AND "status" IN ('APPROVED', 'PENDING');
UPDATE "Post" SET "evidence" = 'STATEMENT'
WHERE "currentVersion" > 1 AND "evidence" = 'MATERIAL';
