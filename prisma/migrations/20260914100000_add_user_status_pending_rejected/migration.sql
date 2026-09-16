-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'rejected';
