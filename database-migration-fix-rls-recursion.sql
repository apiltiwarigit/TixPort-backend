-- Fix RLS recursion and allow public config reads
-- Run this against your Supabase/Postgres database

-- 1) Remove recursive policies on user_roles that self-reference user_roles
DROP POLICY IF EXISTS "Owner can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can grant roles" ON user_roles;

-- Keep/ensure the safe policy that does NOT self-reference:
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT USING (auth.uid() = id);

-- (Optional) If you need admins to manage roles via application code,
-- ensure those operations go through the service key (bypasses RLS).

-- 2) Add a public read policy for project_config so anon/public can read public settings
DROP POLICY IF EXISTS "Anyone can view public config" ON project_config;
CREATE POLICY "Anyone can view public config" ON project_config
  FOR SELECT USING (is_public = true);

-- 3) Verify hero_sections already has a public read policy; no changes needed here.
--    Same for categories and homepage_categories (public read of visible/active rows).

-- 4) Sanity checks
-- List current policies for affected tables (optional, for verification)
-- \dP+ user_roles
-- \dP+ project_config


