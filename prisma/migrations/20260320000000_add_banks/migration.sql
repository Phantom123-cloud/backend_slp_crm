-- CreateTable
CREATE TABLE "banks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_banks" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,

    CONSTRAINT "trip_banks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banks_name_key" ON "banks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "trip_banks_tripId_bankId_key" ON "trip_banks"("tripId", "bankId");

-- AddForeignKey
ALTER TABLE "trip_banks" ADD CONSTRAINT "trip_banks_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_banks" ADD CONSTRAINT "trip_banks_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
