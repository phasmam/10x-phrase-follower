-- Seed file for development
-- Creates the default user for development testing

-- Insert the default user into auth.users first
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '0a1f3212-c55f-4a62-bc0f-4121a7a72283',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dev@example.com',
  crypt('password', gen_salt('bf')),
  NOW(),
  NULL,
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Insert the default user into the users table
INSERT INTO users (id, created_at) 
VALUES ('0a1f3212-c55f-4a62-bc0f-4121a7a72283', NOW())
ON CONFLICT (id) DO NOTHING;
