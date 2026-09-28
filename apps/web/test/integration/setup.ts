// Runs before the test modules import src/lib/env, so the app under test uses the test Redis DB
// and the tmpfs test database (migrated by global-setup.ts).
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.APP_URL = "http://localhost:3000";
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? "fatal";
