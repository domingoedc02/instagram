-- 20260928170546 dropped this index because schema.prisma did not declare it, so `migrate dev`
-- saw it as drift. It is declared now; recreate it for display-name search.
CREATE INDEX "users_name_trgm_idx" ON "users" USING GIN ("name" gin_trgm_ops);
