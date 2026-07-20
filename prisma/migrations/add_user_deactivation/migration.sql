-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'deactivated';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "scheduledDeletionAt" TIMESTAMP(3);
