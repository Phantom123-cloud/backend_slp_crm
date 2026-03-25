-- CreateTable
CREATE TABLE "guest_lists" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicatesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "guest_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_records" (
    "id" TEXT NOT NULL,
    "guestListId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "fullName" TEXT,
    "couponNumber" TEXT,
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "phone3" TEXT,
    "guestsCount" INTEGER,
    "pairsCount" INTEGER,
    "passportCount" INTEGER,
    "age" INTEGER,
    "insteadOf" TEXT,
    "guestFullName" TEXT,
    "guestPhone" TEXT,
    "leftStatus" TEXT,
    "leftReason" TEXT,
    "notes" VARCHAR(150),
    "presentationNumber" INTEGER,
    "time" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_import_logs" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "guestListId" TEXT,
    "action" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "duplicatesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "guest_import_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "guest_lists" ADD CONSTRAINT "guest_lists_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_lists" ADD CONSTRAINT "guest_lists_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_records" ADD CONSTRAINT "guest_records_guestListId_fkey" FOREIGN KEY ("guestListId") REFERENCES "guest_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_records" ADD CONSTRAINT "guest_records_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_import_logs" ADD CONSTRAINT "guest_import_logs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_import_logs" ADD CONSTRAINT "guest_import_logs_guestListId_fkey" FOREIGN KEY ("guestListId") REFERENCES "guest_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_import_logs" ADD CONSTRAINT "guest_import_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
