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
AND tablename IN ('profiles', 'orders', 'order_items', 'saved_events', 'search_history')
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
AND tablename IN ('profiles', 'orders', 'order_items', 'saved_events', 'search_history')
ORDER BY tablename, attname;
