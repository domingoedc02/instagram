-- 0001_init compared the citext column directly, and citext regex matching is case-insensitive,
-- so 'UPPER' passed. Compare the text value so only lowercase handles are accepted.
ALTER TABLE "users" DROP CONSTRAINT "users_username_format_chk";
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_chk"
  CHECK ("username"::text ~ '^[a-z0-9._]{3,30}$');
