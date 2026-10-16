ALTER TABLE "Post" ADD COLUMN "submissionKey" TEXT;
ALTER TABLE "Post" ADD COLUMN "submissionDigest" TEXT;
CREATE UNIQUE INDEX "Post_authorId_submissionKey_key" ON "Post"("authorId", "submissionKey");
