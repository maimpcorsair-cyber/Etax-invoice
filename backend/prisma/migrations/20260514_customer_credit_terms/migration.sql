-- Optional customer credit terms for sales workflow and future credit control
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "creditDays" INTEGER;
