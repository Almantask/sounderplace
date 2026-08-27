-- Password-only accounts cannot be admin from a self-asserted email.
UPDATE user
SET email_verified = 0, updated_at = CAST(unixepoch() * 1000 AS INTEGER)
WHERE email_verified = 1
  AND id NOT IN (
    SELECT user_id FROM account WHERE provider_id = 'github'
  );
