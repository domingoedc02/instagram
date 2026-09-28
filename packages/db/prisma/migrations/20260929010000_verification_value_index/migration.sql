-- Verification tokens are looked up by their SHA-256 (INS-22); the raw token is never stored.
CREATE INDEX "verifications_value_idx" ON "verifications"("value");
