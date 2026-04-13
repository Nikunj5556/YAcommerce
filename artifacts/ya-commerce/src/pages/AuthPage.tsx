import { useState } from "react";
import { useLocation } from "wouter";
import { Mail, Phone, Chrome } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type AuthTab = "email" | "phone" | "google";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<AuthTab>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"input" | "verify">("input");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.url) window.location.href = data.url;
    } catch {
      toast({ title: "Failed", description: "Could not start Google sign in.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>("/api/auth/email/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (res.success) {
        setStep("verify");
        toast({ title: "Code sent", description: res.message });
      } else {
        toast({ title: "Failed", description: res.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!email || !otp) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; session?: Record<string, unknown>; error?: string }>("/api/auth/email/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      if (res.success && res.session) {
        const properties = res.session.properties as Record<string, unknown> | undefined;
        const hashed_token = properties?.hashed_token as string | undefined;
        if (hashed_token) {
          await supabase.auth.verifyOtp({ email, token: hashed_token, type: "magiclink" });
        }
        toast({ title: "Welcome!", description: "You are now signed in." });
        setLocation("/");
      } else {
        toast({ title: "Invalid code", description: res.error || "Please try again.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>("/api/auth/phone/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      if (res.success) {
        setStep("verify");
        toast({ title: "Code sent", description: res.message });
      } else {
        toast({ title: "Failed", description: res.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!phone || !otp) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; session?: Record<string, unknown>; error?: string }>("/api/auth/phone/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, otp }),
      });
      if (res.success) {
        toast({ title: "Welcome!", description: "You are now signed in." });
        setLocation("/");
      } else {
        toast({ title: "Invalid code", description: res.error || "Please try again.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">YA</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to YA Commerce</h1>
          <p className="text-gray-500 mt-1">Sign in or create an account</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
            {[
              { key: "email" as AuthTab, icon: Mail, label: "Email" },
              { key: "phone" as AuthTab, icon: Phone, label: "Phone" },
              { key: "google" as AuthTab, icon: Chrome, label: "Google" },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                data-testid={`tab-${key}`}
                onClick={() => { setTab(key); setStep("input"); setOtp(""); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {tab === "google" && (
            <button
              data-testid="button-google-signin"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Chrome size={18} />
              {loading ? "Signing in..." : "Continue with Google"}
            </button>
          )}

          {tab === "email" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  data-testid="input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              {step === "verify" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                  <input
                    data-testid="input-otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              )}
              <button
                data-testid="button-email-submit"
                onClick={step === "input" ? handleSendEmailOtp : handleVerifyEmailOtp}
                disabled={loading || (step === "input" ? !email : !otp)}
                className="w-full px-4 py-3 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {loading ? "Please wait..." : step === "input" ? "Send Verification Code" : "Verify & Sign In"}
              </button>
            </div>
          )}

          {tab === "phone" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  data-testid="input-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              {step === "verify" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp OTP</label>
                  <input
                    data-testid="input-phone-otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              )}
              <button
                data-testid="button-phone-submit"
                onClick={step === "input" ? handleSendPhoneOtp : handleVerifyPhoneOtp}
                disabled={loading || (step === "input" ? !phone : !otp)}
                className="w-full px-4 py-3 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {loading ? "Please wait..." : step === "input" ? "Send OTP via WhatsApp" : "Verify & Sign In"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
