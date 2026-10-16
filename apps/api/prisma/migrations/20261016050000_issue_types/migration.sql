-- Existing records retain an empty classification; no labels are inferred from prose.
ALTER TABLE "PostDraft" ADD COLUMN "issueTypes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PostRevision" ADD COLUMN "issueTypes" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "PostIssue" (
    "postId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    PRIMARY KEY ("postId", "code"),
    CONSTRAINT "PostIssue_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostIssue_code_postId_idx" ON "PostIssue"("code", "postId");
