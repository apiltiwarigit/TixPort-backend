-- =====================================================
-- TixPort Sidebar Featured Categories Migration
-- =====================================================
-- This migration adds the featured_categories JSONB field to the categories table
-- for storing sidebar featured categories with display order and status

-- Add featured_categories JSONB field to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS featured_categories JSONB DEFAULT '[]'::jsonb;

-- Add comment to explain the structure
COMMENT ON COLUMN categories.featured_categories IS 'Array of featured category objects for sidebar: [{category_id: 1, display_order: 1, is_active: true}]';

-- Create index for better performance when querying featured categories
CREATE INDEX IF NOT EXISTS idx_categories_featured ON categories USING GIN(featured_categories);

-- Verify the column was added
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'categories'
    AND column_name = 'featured_categories';

-- Show current featured_categories content (should be empty arrays)
SELECT
    id,
    featured_categories
FROM categories
WHERE jsonb_array_length(featured_categories) > 0
   OR featured_categories != '[]'::jsonb;

-- Example: How to insert featured categories
-- UPDATE categories
-- SET featured_categories = '[
--     {"category_id": 1, "display_order": 1, "is_active": true},
--     {"category_id": 2, "display_order": 2, "is_active": true}
-- ]'::jsonb
-- WHERE id = 1;
