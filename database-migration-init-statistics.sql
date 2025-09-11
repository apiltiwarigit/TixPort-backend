-- =====================================================
-- TixPort Statistics Configuration Migration
-- =====================================================
-- This script initializes the statistics configuration in project_config table
-- Run this after the main database schema is created

-- Update project_config table constraint to include 'stats' type FIRST
ALTER TABLE project_config DROP CONSTRAINT IF EXISTS project_config_config_type_check;
ALTER TABLE project_config ADD CONSTRAINT project_config_config_type_check 
  CHECK (config_type IN ('general', 'location', 'contact', 'api', 'ui', 'stats'));

-- Insert default statistics configuration values
INSERT INTO project_config (config_key, config_value, description, config_type, is_public) VALUES
('stats_manual_likes', '12847', 'Manual count for total likes/reviews', 'stats', true),
('stats_manual_money_saved', '12847', 'Manual count for money saved (in dollars)', 'stats', true),
('stats_manual_tickets_sold', '12847', 'Manual count for tickets sold', 'stats', true),
('stats_real_money_saved', '0', 'Real money saved from completed orders (in dollars)', 'stats', false),
('stats_real_tickets_sold', '0', 'Real tickets sold from completed orders', 'stats', false),
('stats_money_saved_percentage', '10', 'Percentage of order value to count as money saved', 'stats', false)
ON CONFLICT (config_key) DO UPDATE SET
  description = EXCLUDED.description,
  config_type = EXCLUDED.config_type,
  is_public = EXCLUDED.is_public;

-- Add index for statistics queries
CREATE INDEX IF NOT EXISTS idx_project_config_stats ON project_config(config_type) WHERE config_type = 'stats';

-- Update public config allowlist to include stats
-- Note: This will need to be updated in the adminController.js as well
-- Add these keys to the PUBLIC_KEYS array in getPublicConfig method:
-- 'stats_manual_likes', 'stats_manual_money_saved', 'stats_manual_tickets_sold'

-- Check the inserted values
SELECT config_key, config_value, description, config_type, is_public 
FROM project_config 
WHERE config_type = 'stats' 
ORDER BY config_key;

-- Verify constraint update
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conname = 'project_config_config_type_check';
