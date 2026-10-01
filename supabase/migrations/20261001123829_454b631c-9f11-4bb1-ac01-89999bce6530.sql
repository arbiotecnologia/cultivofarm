ALTER TABLE platform_private.provisional_password_state ALTER COLUMN pwd_digest DROP NOT NULL;
UPDATE platform_private.provisional_password_state SET pwd_digest = NULL WHERE pwd_digest IS NOT NULL;