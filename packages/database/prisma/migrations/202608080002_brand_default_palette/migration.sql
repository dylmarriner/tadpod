-- AlterTable
ALTER TABLE "BrandSettings" ALTER COLUMN "primaryColour" SET DEFAULT '#1677FF';
ALTER TABLE "BrandSettings" ALTER COLUMN "accentColour" SET DEFAULT '#6B7280';

-- Only touches the singleton row if it still holds the old factory defaults, so a deliberately
-- customized brand colour is never overwritten by this palette refresh.
UPDATE "BrandSettings"
SET "primaryColour" = '#1677FF', "accentColour" = '#6B7280'
WHERE "singletonKey" = 'default' AND "primaryColour" = '#0F766E' AND "accentColour" = '#14B8A6';
