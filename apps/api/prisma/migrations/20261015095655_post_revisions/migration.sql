-- CreateTable
CREATE TABLE "PostRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "version" INTEGER,
    "baseVersion" INTEGER NOT NULL,
    "pendingKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT NOT NULL DEFAULT 'STATEMENT',
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Post_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("anonymous", "authorId", "body", "createdAt", "disputed", "evidence", "id", "occurredOn", "publishedAt", "reason", "status", "subjectId", "title") SELECT "anonymous", "authorId", "body", "createdAt", "disputed", "evidence", "id", "occurredOn", "publishedAt", "reason", "status", "subjectId", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");
CREATE INDEX "Post_subjectId_status_idx" ON "Post"("subjectId", "status");
CREATE TABLE "new_TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "revisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PostRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TimelineEvent" ("body", "createdAt", "id", "kind", "postId", "title") SELECT "body", "createdAt", "id", "kind", "postId", "title" FROM "TimelineEvent";
DROP TABLE "TimelineEvent";
ALTER TABLE "new_TimelineEvent" RENAME TO "TimelineEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PostRevision_pendingKey_key" ON "PostRevision"("pendingKey");

-- CreateIndex
CREATE INDEX "PostRevision_postId_status_idx" ON "PostRevision"("postId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PostRevision_postId_version_key" ON "PostRevision"("postId", "version");
