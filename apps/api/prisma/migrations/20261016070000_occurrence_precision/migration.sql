ALTER TABLE "Post" ADD COLUMN "occurredPrecision" TEXT NOT NULL DEFAULT 'DAY';
ALTER TABLE "Post" ADD COLUMN "occurredUntil" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PostDraft" ADD COLUMN "occurredPrecision" TEXT NOT NULL DEFAULT 'DAY';
ALTER TABLE "PostDraft" ADD COLUMN "occurredUntil" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PostRevision" ADD COLUMN "occurredPrecision" TEXT NOT NULL DEFAULT 'DAY';
ALTER TABLE "PostRevision" ADD COLUMN "occurredUntil" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Post_status_occurredOn_idx" ON "Post"("status", "occurredOn");
CREATE INDEX "Post_status_occurredUntil_idx" ON "Post"("status", "occurredUntil");
