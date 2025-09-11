-- TixPort Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- =====================================================
-- 1. PROFILES TABLE
-- =====================================================
-- This table stores additional user profile information
-- linked to Supabase auth.users table

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  newsletter_subscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- 2. ROW LEVEL SECURITY (RLS) FOR PROFILES
-- =====================================================
-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own profile
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile" ON profiles
  FOR DELETE USING (auth.uid() = id);

-- =====================================================
-- 3. ORDERS TABLE (for ticket purchases)
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Order details
  order_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Event information
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TIMESTAMP WITH TIME ZONE,
  venue_name TEXT,
  
  -- Billing information
  billing_first_name TEXT,
  billing_last_name TEXT,
  billing_email TEXT,
  billing_phone TEXT,
  billing_address TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  billing_country TEXT DEFAULT 'US',
  
  -- Payment information
  payment_method TEXT, -- card, paypal, etc.
  payment_status TEXT DEFAULT 'pending', -- pending, paid, failed, refunded
  payment_intent_id TEXT, -- Stripe payment intent ID
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own orders
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own orders
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
CREATE POLICY "Users can insert own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own orders
DROP POLICY IF EXISTS "Users can update own orders" ON orders;
CREATE POLICY "Users can update own orders" ON orders
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- 4. ORDER_ITEMS TABLE (individual tickets in an order)
-- =====================================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  
  -- Ticket details
  ticket_id TEXT NOT NULL,
  section TEXT,
  row_name TEXT,
  seat_number TEXT,
  ticket_type TEXT, -- general_admission, reserved_seating, vip, etc.
  
  -- Pricing
  price DECIMAL(10,2) NOT NULL,
  fees DECIMAL(10,2) DEFAULT 0.00,
  taxes DECIMAL(10,2) DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL,
  
  -- Ticket status
  status TEXT DEFAULT 'pending', -- pending, confirmed, delivered, cancelled
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on order_items table
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own order items
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own order items
DROP POLICY IF EXISTS "Users can insert own order items" ON order_items;
CREATE POLICY "Users can insert own order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_items.order_id 
      AND orders.user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. SAVED_EVENTS TABLE (user's saved/favorited events)
-- =====================================================
CREATE TABLE IF NOT EXISTS saved_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TIMESTAMP WITH TIME ZONE,
  venue_name TEXT,
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Prevent duplicate saves
  UNIQUE(user_id, event_id)
);

-- Enable RLS on saved_events table
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own saved events
DROP POLICY IF EXISTS "Users can view own saved events" ON saved_events;
CREATE POLICY "Users can view own saved events" ON saved_events
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own saved events
DROP POLICY IF EXISTS "Users can insert own saved events" ON saved_events;
CREATE POLICY "Users can insert own saved events" ON saved_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own saved events
DROP POLICY IF EXISTS "Users can delete own saved events" ON saved_events;
CREATE POLICY "Users can delete own saved events" ON saved_events
  FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 6. SEARCH_HISTORY TABLE (user's search history)
-- =====================================================
CREATE TABLE IF NOT EXISTS search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  search_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'general', -- general, artist, venue, location
  results_count INTEGER DEFAULT 0,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on search_history table
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own search history
DROP POLICY IF EXISTS "Users can view own search history" ON search_history;
CREATE POLICY "Users can view own search history" ON search_history
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own search history
DROP POLICY IF EXISTS "Users can insert own search history" ON search_history;
CREATE POLICY "Users can insert own search history" ON search_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 7. INDEXES FOR PERFORMANCE
-- =====================================================

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_profiles_last_name ON profiles(last_name);

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Order items table indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_id ON order_items(ticket_id);

-- Saved events table indexes
CREATE INDEX IF NOT EXISTS idx_saved_events_user_id ON saved_events(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_events_event_id ON saved_events(event_id);
CREATE INDEX IF NOT EXISTS idx_saved_events_saved_at ON saved_events(saved_at);

-- Search history table indexes
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at);

-- =====================================================
-- 8. TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

-- Triggers for profiles table
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for orders table
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for order_items table
DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
CREATE TRIGGER update_order_items_updated_at 
    BEFORE UPDATE ON order_items 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. FUNCTIONS FOR COMMON OPERATIONS
-- =====================================================

-- Function to get user's order history with items
CREATE OR REPLACE FUNCTION get_user_orders(user_uuid UUID)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  status TEXT,
  total_amount DECIMAL,
  event_name TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  items_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.order_number,
    o.status,
    o.total_amount,
    o.event_name,
    o.event_date,
    o.created_at,
    COUNT(oi.id) as items_count
  FROM orders o
  LEFT JOIN order_items oi ON o.id = oi.order_id
  WHERE o.user_id = user_uuid
  GROUP BY o.id, o.order_number, o.status, o.total_amount, o.event_name, o.event_date, o.created_at
  ORDER BY o.created_at DESC;
END;
$$;

-- =====================================================
-- 10. SAMPLE DATA (OPTIONAL - FOR DEVELOPMENT)
-- =====================================================

-- You can uncomment and modify this section for development/testing

/*
-- Sample profile data (replace with your user ID from auth.users)
INSERT INTO profiles (id, first_name, last_name, newsletter_subscribed) VALUES
('your-user-id-here', 'John', 'Doe', true);

-- Sample saved events
INSERT INTO saved_events (user_id, event_id, event_name, event_date, venue_name) VALUES
('your-user-id-here', 'event123', 'Sample Concert', '2024-06-15 20:00:00+00', 'Madison Square Garden');
*/

-- =====================================================
-- 11. ADMIN PANEL TABLES
-- =====================================================

-- User roles table for admin panel access control
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Owner can manage all roles
DROP POLICY IF EXISTS "Owner can manage all roles" ON user_roles;
CREATE POLICY "Owner can manage all roles" ON user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.id = auth.uid()
      AND ur.role = 'owner'
    )
  );

-- Policy: Admins can view all roles but only grant/revoke admin and user roles
DROP POLICY IF EXISTS "Admins can view roles" ON user_roles;
CREATE POLICY "Admins can view roles" ON user_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Policy: Admins can insert non-owner roles
DROP POLICY IF EXISTS "Admins can grant roles" ON user_roles;
CREATE POLICY "Admins can grant roles" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
    AND role != 'owner'
  );

-- Policy: Users can view their own role
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT USING (auth.uid() = id);

-- Hero section content management
CREATE TABLE IF NOT EXISTS hero_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  primary_button_text TEXT DEFAULT 'View Tickets',
  primary_button_url TEXT,
  secondary_button_text TEXT DEFAULT 'View Dates',
  secondary_button_url TEXT,
  is_active BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on hero_sections table
ALTER TABLE hero_sections ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view active hero sections
DROP POLICY IF EXISTS "Anyone can view active hero sections" ON hero_sections;
CREATE POLICY "Anyone can view active hero sections" ON hero_sections
  FOR SELECT USING (is_active = true);

-- Policy: Admins can manage hero sections
DROP POLICY IF EXISTS "Admins can manage hero sections" ON hero_sections;
CREATE POLICY "Admins can manage hero sections" ON hero_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Categories table to store synced category data
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  is_visible BOOLEAN DEFAULT true,
  featured_categories JSONB DEFAULT '[]'::jsonb, -- Array of featured category objects: [{category_id: 1, display_order: 1, is_active: true}]
  api_data JSONB, -- Store full API response for reference
  sync_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on categories table
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view visible categories
DROP POLICY IF EXISTS "Anyone can view visible categories" ON categories;
CREATE POLICY "Anyone can view visible categories" ON categories
  FOR SELECT USING (is_visible = true);

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

-- Homepage category selection (max 3, min 1)
CREATE TABLE IF NOT EXISTS homepage_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  UNIQUE(category_id, is_active) -- Prevent duplicate active categories
);

-- Enable RLS on homepage_categories table
ALTER TABLE homepage_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active homepage categories
DROP POLICY IF EXISTS "Anyone can view active homepage categories" ON homepage_categories;
CREATE POLICY "Anyone can view active homepage categories" ON homepage_categories
  FOR SELECT USING (is_active = true);

-- Policy: Admins can manage homepage categories
DROP POLICY IF EXISTS "Admins can manage homepage categories" ON homepage_categories;
CREATE POLICY "Admins can manage homepage categories" ON homepage_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- Project configuration settings
CREATE TABLE IF NOT EXISTS project_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  config_type TEXT DEFAULT 'general' CHECK (config_type IN ('general', 'location', 'contact', 'api', 'ui')),
  is_public BOOLEAN DEFAULT false, -- Whether this config can be accessed by frontend
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on project_config table
ALTER TABLE project_config ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view public config
DROP POLICY IF EXISTS "Anyone can view public config" ON project_config;
CREATE POLICY "Anyone can view public config" ON project_config
  FOR SELECT USING (is_public = true);

-- Policy: Admins can manage all config
DROP POLICY IF EXISTS "Admins can manage config" ON project_config;
CREATE POLICY "Admins can manage config" ON project_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.id = auth.uid() 
      AND ur.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- 12. ADMIN INDEXES
-- =====================================================

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_granted_at ON user_roles(granted_at);

-- Hero sections indexes
CREATE INDEX IF NOT EXISTS idx_hero_sections_active ON hero_sections(is_active);
CREATE INDEX IF NOT EXISTS idx_hero_sections_order ON hero_sections(display_order);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_visible ON categories(is_visible);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Homepage categories indexes
CREATE INDEX IF NOT EXISTS idx_homepage_categories_order ON homepage_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_homepage_categories_active ON homepage_categories(is_active);

-- Project config indexes
CREATE INDEX IF NOT EXISTS idx_project_config_key ON project_config(config_key);
CREATE INDEX IF NOT EXISTS idx_project_config_type ON project_config(config_type);
CREATE INDEX IF NOT EXISTS idx_project_config_public ON project_config(is_public);

-- =====================================================
-- 13. ADMIN TRIGGERS
-- =====================================================

-- Triggers for user_roles table
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at 
    BEFORE UPDATE ON user_roles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for hero_sections table
DROP TRIGGER IF EXISTS update_hero_sections_updated_at ON hero_sections;
CREATE TRIGGER update_hero_sections_updated_at 
    BEFORE UPDATE ON hero_sections 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for categories table
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON categories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for homepage_categories table
DROP TRIGGER IF EXISTS update_homepage_categories_updated_at ON homepage_categories;
CREATE TRIGGER update_homepage_categories_updated_at 
    BEFORE UPDATE ON homepage_categories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for project_config table
DROP TRIGGER IF EXISTS update_project_config_updated_at ON project_config;
CREATE TRIGGER update_project_config_updated_at 
    BEFORE UPDATE ON project_config 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 14. ADMIN FUNCTIONS
-- =====================================================

-- Function to ensure homepage categories limit (max 3)
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
    ) >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 active homepage categories allowed';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for homepage categories limit
DROP TRIGGER IF EXISTS check_homepage_categories_limit_trigger ON homepage_categories;
CREATE TRIGGER check_homepage_categories_limit_trigger
    BEFORE INSERT OR UPDATE ON homepage_categories
    FOR EACH ROW
    EXECUTE FUNCTION check_homepage_categories_limit();

-- Function to sync categories from API (to be called by admin)
CREATE OR REPLACE FUNCTION sync_categories_from_api(api_categories JSONB)
RETURNS TABLE (
  inserted_count INTEGER,
  updated_count INTEGER,
  total_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_record RECORD;
  inserted_count INTEGER := 0;
  updated_count INTEGER := 0;
BEGIN
  -- Loop through API categories
  FOR category_record IN
    SELECT 
      (value->>'id')::INTEGER as cat_id,
      value->>'name' as cat_name,
      CASE 
        WHEN value->'parent' IS NOT NULL THEN (value->'parent'->>'id')::INTEGER
        ELSE NULL
      END as parent_cat_id,
      value as full_data
    FROM jsonb_array_elements(api_categories)
  LOOP
    -- Generate slug from name
    DECLARE
      cat_slug TEXT := COALESCE(
        lower(regexp_replace(regexp_replace(category_record.cat_name, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g')),
        'category-' || category_record.cat_id::TEXT
      );
    BEGIN
      -- Insert or update category
      INSERT INTO categories (id, name, slug, parent_id, api_data, sync_at)
      VALUES (
        category_record.cat_id,
        category_record.cat_name,
        cat_slug,
        category_record.parent_cat_id,
        category_record.full_data,
        timezone('utc'::text, now())
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        parent_id = EXCLUDED.parent_id,
        api_data = EXCLUDED.api_data,
        sync_at = EXCLUDED.sync_at,
        updated_at = timezone('utc'::text, now());
        
      -- Count operations
      IF TG_OP = 'INSERT' THEN
        inserted_count := inserted_count + 1;
      ELSE
        updated_count := updated_count + 1;
      END IF;
    END;
  END LOOP;
  
  RETURN QUERY SELECT inserted_count, updated_count, inserted_count + updated_count;
END;
$$;

-- =====================================================
-- 15. INITIAL ADMIN DATA
-- =====================================================

-- Admin roles will be assigned through the admin panel
-- No hardcoded owner email - all roles come from user_roles table

-- Insert default project configuration
INSERT INTO project_config (config_key, config_value, description, config_type, is_public) VALUES
('location_search_radius', '60', 'Default radius in miles for location-based event searches', 'location', true),
('contact_email', '"support@tixport.com"', 'Primary contact email address', 'contact', true),
('contact_phone', '"+1-555-123-4567"', 'Primary contact phone number', 'contact', true),
('contact_address', '"123 Main St, City, State 12345"', 'Business address', 'contact', true),
('site_name', '"TixPort"', 'Site name for branding', 'ui', true),
('max_homepage_categories', '3', 'Maximum number of categories to display on homepage', 'ui', false),
('min_homepage_categories', '1', 'Minimum number of categories required on homepage', 'ui', false),
('api_cache_duration', '300', 'API cache duration in seconds', 'api', false),
('maintenance_mode', 'false', 'Enable/disable maintenance mode', 'general', false)
ON CONFLICT (config_key) DO NOTHING;

-- Hero sections will be created through the admin panel
-- No hardcoded hero content - all content managed dynamically

-- =====================================================
-- SCHEMA COMPLETE
-- =====================================================

-- Check if all tables were created successfully
SELECT 
  schemaname,
  tablename,
  hasindexes,
  hasrules,
  hastriggers
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'orders', 'order_items', 'saved_events', 'search_history', 'user_roles', 'hero_sections', 'categories', 'homepage_categories', 'project_config')
ORDER BY tablename;

-- Display table sizes (useful for monitoring)
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'orders', 'order_items', 'saved_events', 'search_history', 'user_roles', 'hero_sections', 'categories', 'homepage_categories', 'project_config')
ORDER BY tablename, attname;
