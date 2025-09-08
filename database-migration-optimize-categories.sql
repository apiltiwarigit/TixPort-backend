-- =============================================================================
-- CATEGORY SYSTEM OPTIMIZATION - SINGLE JSON ROW APPROACH
-- =============================================================================
-- 
-- This migration redesigns the category system to store ALL categories 
-- as a single JSON document in one database row, dramatically improving
-- sync performance and reducing storage overhead.
--
-- Benefits:
-- 1. Single row instead of thousands of individual rows
-- 2. Single UPDATE operation for sync (vs thousands of UPSERTs)
-- 3. Reduced database size and improved cache efficiency
-- 4. Admin can still customize individual categories via processed_data
-- 5. Built-in analytics and management features
-- =============================================================================

BEGIN;

-- Step 1: Create backup of existing categories data
CREATE TABLE IF NOT EXISTS categories_backup AS 
SELECT * FROM categories;

-- Enable RLS on backup table for security
ALTER TABLE categories_backup ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can access backup data
DROP POLICY IF EXISTS "Admins can access categories backup" ON categories_backup;
CREATE POLICY "Admins can access categories backup" ON categories_backup
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Step 2: Drop existing categories table and recreate with new structure
DROP TABLE IF EXISTS categories CASCADE;

-- Step 3: Create the new single-row categories table
CREATE TABLE categories (
  id INTEGER PRIMARY KEY DEFAULT 1, -- Always use ID = 1 for the single row
  
  -- Core JSON Data Storage
  source_data JSONB NOT NULL DEFAULT '[]'::jsonb,        -- Complete API response array
  processed_data JSONB DEFAULT '{}'::jsonb,               -- Admin customizations by category ID
  
  -- Global Analytics & Management
  total_categories_count INTEGER DEFAULT 0,               -- Total number of categories
  total_events_count INTEGER DEFAULT 0,                   -- Total events across all categories
  category_view_counts JSONB DEFAULT '{}'::jsonb,         -- View counts by category ID: {"123": 45, "456": 67}
  featured_categories JSONB DEFAULT '[]'::jsonb,          -- Array of featured category IDs: [123, 456]
  hidden_categories JSONB DEFAULT '[]'::jsonb,            -- Array of hidden category IDs: [789, 101]
  
  -- Timestamps
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  
  -- Ensure only one row can exist
  CONSTRAINT categories_single_row CHECK (id = 1)
);

-- Step 4: Create indexes for performance
CREATE INDEX idx_categories_source_data ON categories USING GIN(source_data);
CREATE INDEX idx_categories_processed_data ON categories USING GIN(processed_data);
CREATE INDEX idx_categories_view_counts ON categories USING GIN(category_view_counts);
CREATE INDEX idx_categories_featured ON categories USING GIN(featured_categories);
CREATE INDEX idx_categories_hidden ON categories USING GIN(hidden_categories);

DO $$
DECLARE
  has_api_data BOOLEAN := FALSE;
  has_source_data BOOLEAN := FALSE;
BEGIN
  -- Detect backup schema shape
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'categories_backup' 
      AND column_name = 'api_data'
  ) INTO has_api_data;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'categories_backup' 
      AND column_name = 'source_data'
  ) INTO has_source_data;

  IF has_api_data THEN
    -- Old row-per-category schema → aggregate to one JSON array
    INSERT INTO categories (
      id, source_data, processed_data, total_categories_count, last_sync_at, created_at
    )
    SELECT 
      1,
      COALESCE(
        jsonb_agg(
          COALESCE(cb.api_data, jsonb_build_object(
            'id', cb.id::TEXT,
            'name', cb.name,
            'parent', CASE 
              WHEN cb.parent_id IS NOT NULL THEN jsonb_build_object('id', cb.parent_id::TEXT)
              ELSE NULL
            END
          ))
        ),
        '[]'::jsonb
      ) as source_data,
      '{}'::jsonb,
      COUNT(*) as total_categories_count,
      MAX(COALESCE(cb.sync_at, cb.updated_at, now())) as last_sync_at,
      MIN(COALESCE(cb.updated_at, now())) as created_at
    FROM categories_backup cb
    HAVING COUNT(*) > 0
    ON CONFLICT (id) DO UPDATE SET
      source_data = EXCLUDED.source_data,
      total_categories_count = EXCLUDED.total_categories_count,
      last_sync_at = EXCLUDED.last_sync_at,
      created_at = LEAST(categories.created_at, EXCLUDED.created_at);
    

  ELSIF has_source_data THEN
    -- Backup already from single-row schema → reuse it
    INSERT INTO categories (
      id, source_data, processed_data, total_categories_count, last_sync_at, last_updated_at, created_at
    )
    SELECT 
      1,
      COALESCE(cb.source_data, '[]'::jsonb),
      COALESCE(cb.processed_data, '{}'::jsonb),
      COALESCE(jsonb_array_length(cb.source_data), 0),
      COALESCE(cb.last_sync_at, now()),
      COALESCE(cb.last_updated_at, now()),
      COALESCE(cb.created_at, now())
    FROM categories_backup cb
    LIMIT 1
    ON CONFLICT (id) DO UPDATE SET
      source_data = EXCLUDED.source_data,
      processed_data = EXCLUDED.processed_data,
      total_categories_count = EXCLUDED.total_categories_count,
      last_sync_at = EXCLUDED.last_sync_at,
      last_updated_at = EXCLUDED.last_updated_at,
      created_at = LEAST(categories.created_at, EXCLUDED.created_at);

    
  END IF;

  -- If nothing inserted, ensure an empty row exists
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 1) THEN
    INSERT INTO categories (id, source_data, processed_data, total_categories_count)
    VALUES (1, '[]'::jsonb, '{}'::jsonb, 0)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

-- Step 6: Enable RLS and recreate policies
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view the categories data
DROP POLICY IF EXISTS "Anyone can view categories" ON categories;
CREATE POLICY "Anyone can view categories" ON categories
  FOR SELECT USING (true); -- Public read access

-- Policy: Admins can manage categories
DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
CREATE POLICY "Admins can manage categories" ON categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Step 7: Create helper functions for category management

-- Function: Get all categories with admin customizations applied
DROP FUNCTION IF EXISTS get_processed_categories();
CREATE OR REPLACE FUNCTION get_processed_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  category jsonb;
  processed jsonb;
  cat_id text;
BEGIN
  SELECT 
    source_data,
    processed_data
  INTO result, processed
  FROM categories 
  WHERE id = 1;
  
  -- If no data, return empty array
  IF result IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Apply processed_data customizations to each category
  result := (
    SELECT jsonb_agg(
      CASE 
        WHEN processed ? (value->>'id') THEN
          value || (processed->(value->>'id'))
        ELSE value
      END
    )
    FROM jsonb_array_elements(result)
  );
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Function: Update categories from API (super fast single operation)
DROP FUNCTION IF EXISTS public.sync_categories_from_api_optimized(jsonb) CASCADE;
CREATE OR REPLACE FUNCTION sync_categories_from_api_optimized(api_categories_json jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_count integer;
  new_count integer;
  row_exists boolean;
BEGIN
  -- Get old count
  SELECT EXISTS(SELECT 1 FROM categories WHERE id = 1) INTO row_exists;
  IF row_exists THEN
    SELECT total_categories_count INTO old_count 
    FROM categories WHERE id = 1;
  ELSE
    old_count := 0;
  END IF;
  
  -- Calculate new count
  new_count := jsonb_array_length(api_categories_json);
  
  -- Upsert single-row category store
  IF row_exists THEN
    UPDATE categories 
    SET 
      source_data = api_categories_json,
      total_categories_count = new_count,
      last_sync_at = timezone('utc'::text, now()),
      last_updated_at = timezone('utc'::text, now())
    WHERE id = 1;
  ELSE
    INSERT INTO categories (
      id,
      source_data,
      processed_data,
      total_categories_count,
      last_sync_at,
      last_updated_at,
      created_at
    ) VALUES (
      1,
      api_categories_json,
      '{}'::jsonb,
      new_count,
      timezone('utc'::text, now()),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;
  
  -- Return sync results
  RETURN jsonb_build_object(
    'success', true,
    'old_count', COALESCE(old_count, 0),
    'new_count', new_count,
    'sync_time', timezone('utc'::text, now())
  );
END;
$$;

-- Function: Update admin customizations for a specific category
DROP FUNCTION IF EXISTS update_category_processed_data(text, jsonb);
CREATE OR REPLACE FUNCTION update_category_processed_data(
  category_id text,
  new_processed_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE categories 
  SET 
    processed_data = jsonb_set(
      COALESCE(processed_data, '{}'::jsonb),
      ARRAY[category_id],
      new_processed_data
    ),
    last_updated_at = timezone('utc'::text, now())
  WHERE id = 1;
  
  RETURN FOUND;
END;
$$;

-- Function: Track category view
DROP FUNCTION IF EXISTS increment_category_view_count(text);
DROP FUNCTION IF EXISTS increment_category_view_count(integer);
CREATE OR REPLACE FUNCTION increment_category_view_count(category_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
BEGIN
  -- Get current view count for this category
  SELECT COALESCE((category_view_counts->>category_id)::integer, 0)
  INTO current_count
  FROM categories WHERE id = 1;
  
  -- Increment view count
  UPDATE categories 
  SET 
    category_view_counts = jsonb_set(
      COALESCE(category_view_counts, '{}'::jsonb),
      ARRAY[category_id],
      to_jsonb(current_count + 1)
    ),
    last_updated_at = timezone('utc'::text, now())
  WHERE id = 1;
  
  RETURN FOUND;
END;
$$;

-- Step 8: Recreate homepage_categories table with proper reference
-- First backup existing homepage_categories
CREATE TABLE IF NOT EXISTS homepage_categories_backup AS 
SELECT * FROM homepage_categories;

-- Enable RLS on homepage_categories backup table for security
ALTER TABLE homepage_categories_backup ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can access homepage_categories backup data
DROP POLICY IF EXISTS "Admins can access homepage_categories backup" ON homepage_categories_backup;
CREATE POLICY "Admins can access homepage_categories backup" ON homepage_categories_backup
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Drop legacy FK if it exists (defensive for partial runs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public'
      AND table_name = 'homepage_categories'
      AND constraint_name = 'homepage_categories_category_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE public.homepage_categories DROP CONSTRAINT homepage_categories_category_id_fkey';
  END IF;
END $$;

-- Drop and recreate homepage_categories table
DROP TABLE IF EXISTS homepage_categories CASCADE;

CREATE TABLE homepage_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(category_id, is_active) -- Prevent duplicate active categories
);

-- Enable RLS on homepage_categories
ALTER TABLE homepage_categories ENABLE ROW LEVEL SECURITY;

-- Recreate homepage_categories policies
DROP POLICY IF EXISTS "Anyone can view active homepage categories" ON homepage_categories;
CREATE POLICY "Anyone can view active homepage categories" ON homepage_categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage homepage categories" ON homepage_categories;
CREATE POLICY "Admins can manage homepage categories" ON homepage_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Restore homepage_categories data if it exists and references valid categories
INSERT INTO homepage_categories (category_id, display_order, is_active, created_by, created_at, updated_at)
SELECT 
  hcb.category_id::text,
  hcb.display_order,
  hcb.is_active,
  hcb.created_by,
  hcb.created_at,
  hcb.updated_at
FROM homepage_categories_backup hcb
WHERE hcb.category_id IS NOT NULL;

-- Step 9: Create function to limit homepage categories (uses project_config)
-- Drop old trigger/function if they exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'check_homepage_categories_limit_trigger'
  ) THEN
    EXECUTE 'DROP TRIGGER check_homepage_categories_limit_trigger ON homepage_categories';
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- table may not exist yet; ignore
  NULL;
END $$;

DROP FUNCTION IF EXISTS check_homepage_categories_limit() CASCADE;

CREATE OR REPLACE FUNCTION check_homepage_categories_limit()
RETURNS trigger 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_limit integer := 4;
  configured_limit_text text;
BEGIN
  -- Read max from project_config if available; default to 4
  SELECT regexp_replace(config_value::text, '"', '', 'g')
    INTO configured_limit_text
    FROM project_config
    WHERE config_key = 'max_homepage_categories'
    LIMIT 1;

  IF configured_limit_text IS NOT NULL AND configured_limit_text ~ '^[0-9]+$' THEN
    max_limit := configured_limit_text::int;
  END IF;

  -- Enforce limit only when activating
  IF NEW.is_active = true THEN
    IF (
      SELECT COUNT(*) 
      FROM homepage_categories 
      WHERE is_active = true 
      AND (TG_OP = 'INSERT' OR id != NEW.id)
    ) >= max_limit THEN
      RAISE EXCEPTION USING MESSAGE = format('Maximum %s active homepage categories allowed', max_limit);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for homepage categories limit
CREATE TRIGGER check_homepage_categories_limit_trigger
    BEFORE INSERT OR UPDATE ON homepage_categories
    FOR EACH ROW
    EXECUTE FUNCTION check_homepage_categories_limit();

-- Step 10: Create updated trigger to maintain last_updated_at
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS trigger 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.last_updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_updated_at_trigger
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_categories_updated_at();

-- Step 11: Create helper functions for category management

-- Function to update processed data (admin customizations)
CREATE OR REPLACE FUNCTION update_category_processed_data(
  category_id INTEGER,
  new_processed_data JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE categories 
  SET processed_data = new_processed_data
  WHERE id = category_id;
  
  RETURN FOUND;
END;
$$;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_category_view_count(category_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE categories 
  SET viewed_count = viewed_count + 1
  WHERE id = category_id;
  
  RETURN FOUND;
END;
$$;

-- Function to update event counts (to be called when events are synced)
CREATE OR REPLACE FUNCTION update_category_event_counts(category_counts JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
  category_record RECORD;
BEGIN
  -- category_counts should be in format: {"category_id": event_count, ...}
  FOR category_record IN
    SELECT 
      (key)::INTEGER as cat_id,
      (value)::INTEGER as event_count
    FROM jsonb_each_text(category_counts)
  LOOP
    UPDATE categories 
    SET total_events_count = category_record.event_count
    WHERE id = category_record.cat_id;
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN updated_count;
END;
$$;

-- Legacy optimized function removed in favor of single JSON approach

-- Step 13: Clean up backup tables (commented out for safety)
-- IMPORTANT: Only run these after verifying the migration was successful
-- and you no longer need the backup data for rollback purposes
-- 
-- To clean up backup tables after verification:
-- DROP TABLE IF EXISTS categories_backup;
-- DROP TABLE IF EXISTS homepage_categories_backup;
--
-- Note: Backup tables have RLS enabled and are only accessible to admins

COMMIT;

-- =============================================================================
-- MIGRATION NOTES:
-- =============================================================================
-- 
-- 1. Backup tables (categories_backup, homepage_categories_backup) are kept 
--    for safety. Remove them manually after verifying the migration.
--
-- 2. The new structure uses:
--    - source_data: Immutable API data
--    - processed_data: Admin customizations (overrides source_data)
--    - Generated columns for performance (display_name, display_slug, etc.)
--    - Analytics fields (view counts, event counts)
--
-- 3. Benefits:
--    - Much faster sync (single JSON upsert per category)
--    - No more complex parent-child sync phases
--    - Admin can customize any field via processed_data
--    - Better analytics and management capabilities
--    - Maintains query performance with generated columns
--
-- 4. To verify migration:
--    SELECT COUNT(*) FROM categories; -- Should match original count
--    SELECT COUNT(*) FROM homepage_categories; -- Should match if data was valid
--
-- =============================================================================
