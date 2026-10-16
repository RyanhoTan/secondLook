CREATE TABLE "PostDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "authorId" TEXT NOT NULL,
  "subjectId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "occurredOn" TEXT NOT NULL,
  "anonymous" BOOLEAN NOT NULL,
  "personalExperience" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "mutationKey" TEXT NOT NULL,
  "postId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PostDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PostDraft_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PostDraft_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PostDraft_postId_key" ON "PostDraft"("postId");
CREATE INDEX "PostDraft_authorId_updatedAt_idx" ON "PostDraft"("authorId", "updatedAt");
