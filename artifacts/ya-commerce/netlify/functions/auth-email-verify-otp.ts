import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { successResponse, errorResponse, hashOTP, isValidEmail } from './utils';

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return successResponse({}, 200);
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { email, otp } = JSON.parse(event.body || '{}');

    if (!email || !isValidEmail(email)) {
      return errorResponse('Invalid email address');
    }

    if (!otp || otp.length !== 6) {
      return errorResponse('Invalid OTP');
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify OTP
    const hashedOtp = hashOTP(otp);
    const { data: otpRecord, error: otpError } = await supabase
      .from('temp_otps')
      .select('*')
      .eq('identifier', email)
      .eq('type', 'email')
      .single();

    if (otpError || !otpRecord) {
      return errorResponse('Invalid or expired OTP');
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      await supabase.from('temp_otps').delete().eq('identifier', email);
      return errorResponse('OTP has expired');
    }

    // Check attempts
    if (otpRecord.attempts >= 3) {
      await supabase.from('temp_otps').delete().eq('identifier', email);
      return errorResponse('Too many failed attempts');
    }

    // Verify hash
    if (otpRecord.otp_hash !== hashedOtp) {
      await supabase
        .from('temp_otps')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('identifier', email);
      return errorResponse('Invalid OTP');
    }

    // OTP verified - clean up
    await supabase.from('temp_otps').delete().eq('identifier', email);

    // Check if customer exists
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    let userId = customer?.user_id;

    // If no customer exists, create one
    if (!customer) {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { email_verified: true }
      });

      if (authError || !authData.user) {
        console.error('Auth user creation error:', authError);
        return errorResponse('Failed to create user');
      }

      userId = authData.user.id;

      // Create customer record
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          email,
          email_verified: true,
          phone_verified: false
        });

      if (customerError) {
        console.error('Customer creation error:', customerError);
      }
    } else if (!userId) {
      // Customer exists but no auth user - create auth user and link
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { email_verified: true }
      });

      if (authError || !authData.user) {
        console.error('Auth user creation error:', authError);
        return errorResponse('Failed to create user');
      }

      userId = authData.user.id;

      // Link to customer
      await supabase
        .from('customers')
        .update({ user_id: userId, email_verified: true })
        .eq('email', email);
    } else {
      // Customer and auth user exist - just update email_verified
      await supabase
        .from('customers')
        .update({ email_verified: true })
        .eq('email', email);
    }

    // Generate session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (sessionError || !sessionData) {
      console.error('Session generation error:', sessionError);
      return errorResponse('Failed to create session');
    }

    return successResponse({
      success: true,
      session: sessionData
    });

  } catch (error) {
    console.error('Email verify OTP error:', error);
    return errorResponse('Internal server error', 500);
  }
};

export { handler };
