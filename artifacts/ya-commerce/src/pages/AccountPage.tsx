import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { User, MapPin, LogOut, Package, Heart, Headphones, ChevronRight, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function AccountPage() {
  const { customer, signOut, refreshCustomer } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!customer) return;
    setFirstName(customer.first_name || "");
    setLastName(customer.last_name || "");
    setPhone(customer.phone || "");

    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customer.id)
      .then(({ data }) => { if (data) setAddresses(data); });
  }, [customer]);

  if (!customer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign in to your account</h2>
        <Link href="/auth" className="inline-flex px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600">
          Sign In
        </Link>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from("customers")
        .update({ first_name: firstName, last_name: lastName, phone })
        .eq("id", customer.id);
      await refreshCustomer();
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed", description: "Could not update profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setLocation("/");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Account</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-2">
          {[
            { icon: Package, label: "My Orders", href: "/orders" },
            { icon: Heart, label: "Wishlist", href: "/wishlist" },
            { icon: Headphones, label: "Support", href: "/support" },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <link.icon size={18} className="text-amber-600" />
                  <span className="font-medium text-sm text-gray-900">{link.label}</span>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50 transition-all">
            <LogOut size={18} className="text-red-500" />
            <span className="font-medium text-sm text-red-600">Sign Out</span>
          </button>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <User size={18} /> Profile Information
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={customer.email} disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50">
                <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <MapPin size={18} /> Saved Addresses
            </h2>
            {addresses.length === 0 ? (
              <p className="text-sm text-gray-500">No saved addresses yet.</p>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <div key={addr.id as string} className="p-4 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-amber-600 uppercase">{addr.address_type as string}</span>
                      {addr.is_default && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Default</span>}
                    </div>
                    <p className="font-medium text-sm text-gray-900">{addr.full_name as string}</p>
                    <p className="text-sm text-gray-600">{addr.address_line1 as string}</p>
                    <p className="text-sm text-gray-600">{addr.city as string}, {addr.state as string} - {addr.postal_code as string}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
