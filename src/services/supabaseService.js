const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Use service role for backend operations
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Create anon client for token verification
    this.anonClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);
  }

  /**
   * Sign in user with email and password
   */
  async signInUser(email, password) {
    try {
      const { data, error } = await this.anonClient.auth.signInWithPassword({
        email,
        password,
      });

      return { user: data.user, session: data.session, error };
    } catch (error) {
      return { user: null, session: null, error };
    }
  }

  /**
   * Sign up user with email and password
   */
  async signUpUser(email, password, metadata = {}) {
    try {
      // First try regular signup
      const { data, error } = await this.anonClient.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      // If signup is disabled, try admin create user (for development)
      if (error && error.message.includes('signups are disabled')) {
        console.log('Public signups disabled, attempting admin user creation...');
        
        const { data: adminData, error: adminError } = await this.supabase.auth.admin.createUser({
          email,
          password,
          user_metadata: metadata,
          email_confirm: true // Auto-confirm email
        });

        if (adminError) {
          return { user: null, session: null, error: adminError };
        }

        // For admin-created users, we need to sign them in to get a session
        const { data: signInData, error: signInError } = await this.anonClient.auth.signInWithPassword({
          email,
          password
        });

        return { 
          user: signInData?.user || adminData.user, 
          session: signInData?.session || null, 
          error: signInError 
        };
      }

      return { user: data.user, session: data.session, error };
    } catch (error) {
      return { user: null, session: null, error };
    }
  }

  /**
   * Sign out user
   */
  async signOutUser(token) {
    try {
      // Set the session for this client instance
      await this.anonClient.auth.setSession({
        access_token: token,
        refresh_token: '' // We only have access token from frontend
      });
      
      const { error } = await this.anonClient.auth.signOut();
      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Verify JWT token from frontend
   */
  async verifyToken(token) {
    try {
      const { data: { user }, error } = await this.anonClient.auth.getUser(token);
      
      if (error || !user) {
        throw new Error('Invalid token');
      }

      return user;
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return null;
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId) {
    try {
      // First ensure the profiles table exists
      const tableExists = await this.ensureProfilesTable();
      if (!tableExists) {
        console.warn('Profiles table does not exist, returning null for user profile');
        return null;
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If no profile exists, that's okay - just return null
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      return null;
    }
  }

  /**
   * Create or update user profile
   */
  async upsertUserProfile(userId, profileData) {
    try {
      // First ensure the profiles table exists
      const tableExists = await this.ensureProfilesTable();
      if (!tableExists) {
        throw new Error('Profiles table does not exist. Please create it in Supabase dashboard.');
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .upsert({
          id: userId,
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error upserting user profile:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in upsertUserProfile:', error);
      throw error;
    }
  }

  /**
   * Delete user profile
   */
  async deleteUserProfile(userId) {
    try {
      const { error } = await this.supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error('Error deleting user profile:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteUserProfile:', error);
      throw error;
    }
  }

  /**
   * Admin function: List all users
   */
  async listUsers(page = 1, limit = 50) {
    try {
      const { data, error } = await this.supabase.auth.admin.listUsers({
        page,
        perPage: limit
      });

      if (error) {
        console.error('Error listing users:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in listUsers:', error);
      throw error;
    }
  }

  /**
   * Admin function: Delete user
   */
  async deleteUser(userId) {
    try {
      const { error } = await this.supabase.auth.admin.deleteUser(userId);

      if (error) {
        console.error('Error deleting user:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteUser:', error);
      throw error;
    }
  }

  /**
   * Ensure profiles table exists and create if needed
   */
  async ensureProfilesTable() {
    try {
      // Check if profiles table exists
      const { error } = await this.supabase
        .from('profiles')
        .select('id')
        .limit(1);

      // If table doesn't exist (PGRST116 error), try to create it
      if (error && error.code === 'PGRST116') {
        console.log('Profiles table does not exist, attempting to create...');

        // Note: We can't create tables programmatically via the client
        // This would need to be done via SQL in Supabase dashboard or migration
        // For now, we'll just log the issue and continue
        console.warn('Please create the profiles table in Supabase dashboard using:');
        console.log(`
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  newsletter_subscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
        `);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking profiles table:', error);
      return false;
    }
  }

  /**
   * Create database tables if they don't exist
   */
  async initializeTables() {
    try {
      return await this.ensureProfilesTable();
    } catch (error) {
      console.error('Error initializing tables:', error);
      return false;
    }
  }
}

module.exports = new SupabaseService();
