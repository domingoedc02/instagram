-- Runs once, on first boot of an empty data directory.
-- Extensions (citext, pg_trgm, pg_uuidv7) are created by migration 0001_init, not here:
-- anything created outside Prisma's history shows up as drift and blocks `prisma migrate dev`.

-- Scratch database for the migration drift check (`pnpm db:drift`). Prisma resets it on every run.
CREATE DATABASE ins_shadow;
