-- AlterTable
ALTER TABLE "presentations" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
