-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CASH', 'CREDIT', 'COMPANY', 'MIXED', 'TERMINAL', 'RESERVATION');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('RAFFLE', 'HOURLY');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contractDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "paymentType" "PaymentType" NOT NULL,
    "saleType" "SaleType",
    "presentationId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "speakerId" TEXT,
    "signedById" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceCash" DECIMAL(12,2),
    "advanceTerminal" DECIMAL(12,2),
    "advanceBank" DECIMAL(12,2),
    "installmentMonths" INTEGER,
    "firstPaymentDate" TIMESTAMP(3),
    "registrationAddress" TEXT,
    "actualAddress" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_banks" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,

    CONSTRAINT "contract_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_phones" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_schedules" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contractNumber_key" ON "contracts"("contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "contract_banks_contractId_bankId_key" ON "contract_banks"("contractId", "bankId");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_banks" ADD CONSTRAINT "contract_banks_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_banks" ADD CONSTRAINT "contract_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_phones" ADD CONSTRAINT "contract_phones_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
