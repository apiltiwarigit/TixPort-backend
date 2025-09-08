-- Migration to update homepage categories limit from 3 to 4
-- Run this script to update the database constraint

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS check_homepage_categories_limit_trigger ON homepage_categories;
DROP FUNCTION IF EXISTS check_homepage_categories_limit();

-- Create updated function to allow max 4 categories
CREATE OR REPLACE FUNCTION check_homepage_categories_limit()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if inserting/updating to active
  IF NEW.is_active = true THEN
    -- Count current active categories (excluding the current one if updating)
    IF (
      SELECT COUNT(*) 
      FROM homepage_categories 
      WHERE is_active = true 
      AND (TG_OP = 'INSERT' OR id != NEW.id)
    ) >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 active homepage categories allowed';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER check_homepage_categories_limit_trigger
    BEFORE INSERT OR UPDATE ON homepage_categories
    FOR EACH ROW
    EXECUTE FUNCTION check_homepage_categories_limit();

-- Update project config values
UPDATE project_config SET config_value = '"4"' WHERE config_key = 'max_homepage_categories';

-- Verify the changes
SELECT 
  config_key, 
  config_value, 
  description 
FROM project_config 
WHERE config_key IN ('max_homepage_categories', 'min_homepage_categories');
