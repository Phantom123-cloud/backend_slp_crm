/*
  Warnings:

  - Added the required column `createdById` to the `wallets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `wallets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `wallets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('TRIP', 'PERSONAL');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('INCOME', 'TRANSFER_OUT', 'TRANSFER_IN', 'CONVERSION');

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "type" "WalletType" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "tripId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "wallet_balances" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_txs" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "toCurrency" TEXT,
    "toAmount" DECIMAL(18,4),
    "rate" DECIMAL(18,6),
    "isCustomRate" BOOLEAN NOT NULL DEFAULT false,
    "expenseTypeId" TEXT,
    "description" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_tx_images" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_tx_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transfers" (
    "id" TEXT NOT NULL,
    "fromWalletId" TEXT NOT NULL,
    "toWalletId" TEXT NOT NULL,
    "outTxId" TEXT NOT NULL,
    "inTxId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_balances_walletId_currency_key" ON "wallet_balances"("walletId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transfers_outTxId_key" ON "wallet_transfers"("outTxId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transfers_inTxId_key" ON "wallet_transfers"("inTxId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_types_name_key" ON "expense_types"("name");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_txs" ADD CONSTRAINT "wallet_txs_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_txs" ADD CONSTRAINT "wallet_txs_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "expense_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_txs" ADD CONSTRAINT "wallet_txs_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_txs" ADD CONSTRAINT "wallet_txs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_tx_images" ADD CONSTRAINT "wallet_tx_images_txId_fkey" FOREIGN KEY ("txId") REFERENCES "wallet_txs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_outTxId_fkey" FOREIGN KEY ("outTxId") REFERENCES "wallet_txs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_inTxId_fkey" FOREIGN KEY ("inTxId") REFERENCES "wallet_txs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
