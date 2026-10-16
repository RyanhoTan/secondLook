-- CreateTable
CREATE TABLE "MaterialVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "publicKey" TEXT,
    "reason" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "MaterialVersion_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedVersion" INTEGER,
    "reviewVersion" INTEGER NOT NULL DEFAULT 1,
    "originalKey" TEXT NOT NULL,
    "previewKey" TEXT NOT NULL,
    "publicKey" TEXT,
    "digest" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "Material_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Material_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("clientKey", "createdAt", "digest", "height", "id", "mime", "originalKey", "postId", "previewKey", "publicKey", "reason", "reviewedAt", "size", "source", "status", "uploaderId", "visibility", "width") SELECT "clientKey", "createdAt", "digest", "height", "id", "mime", "originalKey", "postId", "previewKey", "publicKey", "reason", "reviewedAt", "size", "source", "status", "uploaderId", "visibility", "width" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE INDEX "Material_postId_status_idx" ON "Material"("postId", "status");
CREATE UNIQUE INDEX "Material_uploaderId_clientKey_key" ON "Material"("uploaderId", "clientKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MaterialVersion_version_status_idx" ON "MaterialVersion"("version", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialVersion_materialId_version_key" ON "MaterialVersion"("materialId", "version");
