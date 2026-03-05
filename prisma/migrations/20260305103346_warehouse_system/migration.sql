/*
  Warnings:

  - Added the required column `createdById` to the `warehouses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `warehouses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `warehouses` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('CENTRAL', 'PERSONAL', 'TRIP');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOMING', 'SALE', 'GIFT', 'CONTRACT', 'WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN');

-- AlterTable: add new columns with temporary defaults to handle existing rows
ALTER TABLE "warehouses"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Склад',
ADD COLUMN "type" "WarehouseType" NOT NULL DEFAULT 'TRIP',
ADD COLUMN "createdById" TEXT;

-- Backfill: set name from linked trip teamName and createdById from trip createdById
UPDATE "warehouses" w
SET
  "name" = CONCAT('Склад ', t."teamName"),
  "createdById" = t."createdById"
FROM "trips" t
WHERE w."tripId" = t."id";

-- For any warehouses without a trip (just in case), set a fallback createdById from admin
UPDATE "warehouses"
SET "createdById" = (SELECT "id" FROM "users" ORDER BY "createdAt" LIMIT 1)
WHERE "createdById" IS NULL;

-- Remove temporary defaults and make columns NOT NULL
ALTER TABLE "warehouses"
ALTER COLUMN "name" DROP DEFAULT,
ALTER COLUMN "type" DROP DEFAULT,
ALTER COLUMN "createdById" SET NOT NULL;

-- Make tripId optional
ALTER TABLE "warehouses" ALTER COLUMN "tripId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sku" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "note" TEXT,
    "pairId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "stock_warehouseId_productId_key" ON "stock"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "transactions_fromWarehouseId_idx" ON "transactions"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "transactions_toWarehouseId_idx" ON "transactions"("toWarehouseId");

-- CreateIndex
CREATE INDEX "transactions_pairId_idx" ON "transactions"("pairId");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
