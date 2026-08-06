## [ERR-20260806-002] PostgreSQL unavailable during migration verification
Summary: The stock-count migration check initially failed because the local PostgreSQL container was stopped.
Error: Prisma P1001: Can't reach database server at localhost:5432.
Suggested Fix: Start the repository PostgreSQL service before migration verification, then rerun migration and schema validation.
