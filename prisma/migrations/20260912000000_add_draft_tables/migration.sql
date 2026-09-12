-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "draft_pages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_sections" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_components" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "props" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draft_pages_tenantId_slug_key" ON "draft_pages"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "draft_pages_tenantId_idx" ON "draft_pages"("tenantId");

-- CreateIndex
CREATE INDEX "draft_sections_pageId_idx" ON "draft_sections"("pageId");

-- CreateIndex
CREATE INDEX "draft_components_sectionId_idx" ON "draft_components"("sectionId");

-- AddForeignKey
ALTER TABLE "draft_pages" ADD CONSTRAINT "draft_pages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_sections" ADD CONSTRAINT "draft_sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "draft_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_components" ADD CONSTRAINT "draft_components_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "draft_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
