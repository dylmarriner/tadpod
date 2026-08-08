-- AlterTable
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN "taxRateId" UUID;
ALTER TABLE "CustomerInvoiceLine" ADD COLUMN "taxAmountMinorUnits" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX "CustomerInvoiceLine_taxRateId_idx" ON "CustomerInvoiceLine"("taxRateId");

ALTER TABLE "CustomerInvoiceLine" ADD CONSTRAINT "CustomerInvoiceLine_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
