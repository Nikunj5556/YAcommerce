import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, MapPin, LogOut, Settings, Package, Heart, Headphones, RotateCcw, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function AccountPage() {
  const { customer, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addresses, setAddresses] = useState([]);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (customer) {
      setFirstName(customer.first_name || '');
      setLastName(customer.last_name || '');
      setPhone(customer.phone || '');
      supabase.from('customer_addresses').select('*').eq('customer_id', customer.id).then(({ data }) => { if (data) setAddresses(data); });
    }
  }, [customer]);

  if (!customer) return <div className="max-w-7xl mx-auto px-4 py-24 text-center"><User size={48} className="mx-auto mb-4 text-gray-300" /><h2 className="text-2xl font-bold mb-2">Sign in to view account</h2><Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm">Sign In</Link></div>;

  const handleSave = async () => {
    await supabase.from('customers').update({ first_name: firstName, last_name: lastName, phone }).eq('id', customer.id);
    toast({ title: 'Profile updated' }); setEditing(false);
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8" data-testid="account-title">My Account</h1>
      <div className="grid md:grid-cols-3 gap-8">
        {/* Sidebar nav */}
        <div className="space-y-1">
          {[
            { icon: Package, label: 'Orders', to: '/orders' },
            { icon: Heart, label: 'Wishlist', to: '/wishlist' },
            { icon: RotateCcw, label: 'Returns', to: '/returns' },
            { icon: Headphones, label: 'Support', to: '/support' },
          ].map(item => (
            <Link key={item.to} to={item.to} className="flex items-center gap-3 p-3 text-sm font-semibold text-gray-600 hover:text-black hover:bg-gray-50 transition-colors">
              <item.icon size={16} /> {item.label}
            </Link>
          ))}
          <button onClick={handleSignOut} data-testid="sign-out-btn" className="flex items-center gap-3 p-3 text-sm font-semibold text-red-500 hover:bg-red-50 w-full transition-colors">
            <LogOut size={16} /> Sign Out
          </button>
        </div>

        {/* Profile */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500">Profile</h2>
              {!editing && <button onClick={() => setEditing(true)} className="text-xs font-bold text-gray-500 hover:text-black">Edit</button>}
            </div>
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" className="px-3 py-2 border border-gray-200 rounded-sm text-sm" />
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" className="px-3 py-2 border border-gray-200 rounded-sm text-sm" />
                </div>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="w-full px-3 py-2 border border-gray-200 rounded-sm text-sm" />
                <div className="flex gap-2">
                  <button onClick={handleSave} className="px-4 py-2 bg-black text-white text-sm font-bold">Save</button>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 border text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm"><span className="text-gray-500">Name:</span> <strong>{customer.full_name || 'Not set'}</strong></p>
                <p className="text-sm"><span className="text-gray-500">Email:</span> <strong>{customer.email}</strong> {customer.email_verified && <span className="text-[10px] font-bold text-green-600">Verified</span>}</p>
                <p className="text-sm"><span className="text-gray-500">Phone:</span> <strong>{customer.phone || 'Not set'}</strong> {customer.phone_verified && <span className="text-[10px] font-bold text-green-600">Verified</span>}</p>
              </div>
            )}
          </div>

          {/* Addresses */}
          <div className="bg-white border border-gray-200 p-6">
            <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Saved Addresses</h2>
            {addresses.length === 0 ? (
              <p className="text-sm text-gray-500 font-light">No saved addresses. Add one during checkout.</p>
            ) : (
              <div className="space-y-2">
                {addresses.map(addr => (
                  <div key={addr.id} className="p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin size={14} className="text-gray-400" />
                      <span className="text-sm font-bold">{addr.full_name}</span>
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5">{addr.address_type}</span>
                      {addr.is_default && <span className="text-[10px] font-bold text-green-600">Default</span>}
                    </div>
                    <p className="text-sm text-gray-600 font-light">{addr.address_line1}, {addr.city}, {addr.state} {addr.postal_code}</p>
                    {addr.phone_number && <p className="text-xs text-gray-400 mt-1">{addr.phone_number}</p>}
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
