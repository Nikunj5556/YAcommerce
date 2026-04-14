import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, Chrome, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function AuthPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('input');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.url) window.location.href = data.url;
    } catch { toast({ title: 'Failed', description: 'Could not start Google sign in.', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleSendEmailOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/email/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
      if (res.success) { setStep('verify'); toast({ title: 'Code sent', description: res.message }); }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleVerifyEmailOtp = async () => {
    if (!email || !otp) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/email/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
      if (res.success && res.session?.properties?.hashed_token) {
        await supabase.auth.verifyOtp({ email, token: res.session.properties.hashed_token, type: 'magiclink' });
      }
      toast({ title: 'Welcome!', description: 'You are now signed in.' });
      navigate('/');
    } catch (err) { toast({ title: 'Invalid code', description: err.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleSendPhoneOtp = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/phone/send-otp', { method: 'POST', body: JSON.stringify({ phone }) });
      if (res.success) { setStep('verify'); toast({ title: 'Code sent', description: res.message }); }
    } catch (err) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!phone || !otp) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/phone/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) });
      if (res.success && res.session?.properties?.hashed_token) {
        await supabase.auth.verifyOtp({ email: res.session.email, token: res.session.properties.hashed_token, type: 'magiclink' });
      }
      toast({ title: 'Welcome!', description: 'You are now signed in.' });
      navigate('/');
    } catch (err) { toast({ title: 'Invalid code', description: err.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-black rounded flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-sm">YA</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900" data-testid="auth-title">Sign In</h1>
          <p className="text-gray-500 font-light mt-1">Welcome to YA Commerce</p>
        </div>

        {/* Google login */}
        <button onClick={handleGoogleLogin} disabled={loading} data-testid="google-login-btn"
          className="w-full flex items-center justify-center gap-3 px-6 py-3.5 border border-gray-200 font-semibold text-sm text-gray-700 hover:bg-gray-50 hover:border-black transition-colors mb-6">
          <Chrome size={18} /> Continue with Google
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-xs tracking-[0.15em] uppercase font-bold text-gray-400">Or continue with</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 border border-gray-200">
          <button onClick={() => { setTab('email'); setStep('input'); setOtp(''); }} data-testid="email-tab"
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${tab === 'email' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Mail size={16} /> Email
          </button>
          <button onClick={() => { setTab('phone'); setStep('input'); setOtp(''); }} data-testid="phone-tab"
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${tab === 'phone' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Phone size={16} /> Phone
          </button>
        </div>

        {/* Email Tab */}
        {tab === 'email' && (
          <div className="space-y-4">
            {step === 'input' ? (
              <>
                <div>
                  <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                    data-testid="email-input"
                    className="w-full px-4 py-3 border border-gray-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black" />
                </div>
                <button onClick={handleSendEmailOtp} disabled={loading || !email} data-testid="send-email-otp-btn"
                  className="w-full py-3.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {loading ? 'Sending...' : 'SEND CODE'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('input')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-black mb-2">
                  <ArrowLeft size={14} /> Change email
                </button>
                <p className="text-sm text-gray-600">Code sent to <strong>{email}</strong></p>
                <div>
                  <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Verification Code</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
                    data-testid="email-otp-input" maxLength={6}
                    className="w-full px-4 py-3 border border-gray-200 rounded-sm text-sm text-center tracking-[0.5em] font-bold focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black" />
                </div>
                <button onClick={handleVerifyEmailOtp} disabled={loading || otp.length !== 6} data-testid="verify-email-otp-btn"
                  className="w-full py-3.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {loading ? 'Verifying...' : 'VERIFY & SIGN IN'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Phone Tab */}
        {tab === 'phone' && (
          <div className="space-y-4">
            {step === 'input' ? (
              <>
                <div>
                  <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Phone Number</label>
                  <div className="flex">
                    <span className="px-3 py-3 bg-gray-100 border border-r-0 border-gray-200 text-sm text-gray-500 font-semibold">+91</span>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210"
                      data-testid="phone-input" maxLength={10}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black" />
                  </div>
                </div>
                <button onClick={handleSendPhoneOtp} disabled={loading || phone.length !== 10} data-testid="send-phone-otp-btn"
                  className="w-full py-3.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {loading ? 'Sending...' : 'SEND CODE VIA WHATSAPP'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('input')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-black mb-2">
                  <ArrowLeft size={14} /> Change phone
                </button>
                <p className="text-sm text-gray-600">Code sent to <strong>+91 {phone}</strong></p>
                <div>
                  <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Verification Code</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"
                    data-testid="phone-otp-input" maxLength={6}
                    className="w-full px-4 py-3 border border-gray-200 rounded-sm text-sm text-center tracking-[0.5em] font-bold focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black" />
                </div>
                <button onClick={handleVerifyPhoneOtp} disabled={loading || otp.length !== 6} data-testid="verify-phone-otp-btn"
                  className="w-full py-3.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {loading ? 'Verifying...' : 'VERIFY & SIGN IN'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
