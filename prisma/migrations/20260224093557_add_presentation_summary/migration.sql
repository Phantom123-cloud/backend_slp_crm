-- CreateTable
CREATE TABLE "presentation_summary" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "successApproach" INTEGER,
    "totalApproach" INTEGER,
    "refusalCount" INTEGER,
    "refusalValue" INTEGER,
    "rewriteCount" INTEGER,
    "rewriteValue" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presentation_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presentation_summary_presentationId_userId_key" ON "presentation_summary"("presentationId", "userId");

-- AddForeignKey
ALTER TABLE "presentation_summary" ADD CONSTRAINT "presentation_summary_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "presentations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentation_summary" ADD CONSTRAINT "presentation_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
