-- Preserve the original public text for posts created before versioning existed.
INSERT INTO "PostRevision" (
  "id", "postId", "version", "baseVersion", "title", "body", "occurredOn",
  "changeReason", "status", "createdAt", "publishedAt"
)
SELECT "id" || ':v1', "id", 1, 1, "title", "body", "occurredOn",
  '首次公开', 'PUBLISHED', "createdAt", COALESCE("publishedAt", "createdAt")
FROM "Post" WHERE "status" = 'PUBLISHED';
