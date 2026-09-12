-- AlterTable
ALTER TABLE "media" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "media_templateId_idx" ON "media"("templateId");
