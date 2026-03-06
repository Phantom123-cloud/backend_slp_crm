-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterTable: add transferStatus column
ALTER TABLE "transactions" ADD COLUMN "transferStatus" "TransferStatus";

-- Add index
CREATE INDEX "transactions_transferStatus_idx" ON "transactions"("transferStatus");

-- Backfill: all existing TRANSFER_OUT records were created atomically (paired) → mark as COMPLETED
UPDATE "transactions" SET "transferStatus" = 'COMPLETED' WHERE "type" = 'TRANSFER_OUT';

-- Backfill: for existing TRANSFER_OUT records, set toWarehouseId from their paired TRANSFER_IN
UPDATE "transactions" t_out
SET "toWarehouseId" = t_in."toWarehouseId"
FROM "transactions" t_in
WHERE t_out."pairId" = t_in."pairId"
  AND t_out."type" = 'TRANSFER_OUT'
  AND t_in."type" = 'TRANSFER_IN'
  AND t_out."toWarehouseId" IS NULL;
