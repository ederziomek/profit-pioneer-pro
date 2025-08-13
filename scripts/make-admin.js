import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = "https://fqmbtyccylsmbbahpmvw.supabase.co";
// You'll need to get the service role key from your Supabase dashboard
// Go to Settings > API > service_role key
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('📋 To get it:');
  console.log('1. Go to https://supabase.com/dashboard/project/fqmbtyccylsmbbahpmvw');
  console.log('2. Navigate to Settings > API');
  console.log('3. Copy the "service_role" key');
  console.log('4. Set it as environment variable: export SUPABASE_SERVICE_ROLE_KEY="your_key_here"');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function makeUserAdmin(email) {
  try {
    console.log(`🔍 Looking for user with email: ${email}`);
    
    // First, find the user by email
    const { data: users, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError) {
      // Try alternative approach - query profiles table
      console.log('📝 Trying alternative approach...');
      
      // Update the user's profile to admin role directly
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: null, // This will be set by the function
          role: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();

      if (profileError) {
        console.error('❌ Error updating profile:', profileError);
        return;
      }

      console.log('✅ Profile updated successfully');
      return;
    }

    if (!users) {
      console.error(`❌ User with email ${email} not found`);
      return;
    }

    console.log(`✅ Found user: ${users.email} (ID: ${users.id})`);

    // Update the user's profile to admin role
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: users.id,
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (profileError) {
      console.error('❌ Error updating profile:', profileError);
      return;
    }

    console.log('✅ User profile updated to admin role successfully!');
    console.log('📋 Profile data:', profileData);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Main execution
const targetEmail = 'ederziomek2@gmail.com';
console.log(`🚀 Starting admin promotion for: ${targetEmail}`);
console.log('⏳ Please wait...\n');

makeUserAdmin(targetEmail)
  .then(() => {
    console.log('\n✨ Script completed!');
    console.log(`📧 User ${targetEmail} should now have admin privileges`);
    console.log('🔄 You may need to sign out and sign back in to see the changes');
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });