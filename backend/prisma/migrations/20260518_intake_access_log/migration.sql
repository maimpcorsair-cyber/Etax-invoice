-- CreateTable
CREATE TABLE "intake_access_logs" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "isMutation" BOOLEAN NOT NULL DEFAULT false,
    "rlCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_access_logs_companyId_createdAt_idx" ON "intake_access_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "intake_access_logs_intakeId_createdAt_idx" ON "intake_access_logs"("intakeId", "createdAt");

-- CreateIndex
CREATE INDEX "intake_access_logs_lineUserId_createdAt_idx" ON "intake_access_logs"("lineUserId", "createdAt");
