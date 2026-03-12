-- CreateEnum
CREATE TYPE "IncomeSource" AS ENUM ('SUPPLIER', 'SPV');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "source" "IncomeSource";
