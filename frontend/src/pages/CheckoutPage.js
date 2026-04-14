import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Plus, Truck, CreditCard, Banknote, Phone, CheckCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { apiFetch } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

export default function CheckoutPage() {
  const { customer } = useAuth();
  const { items, subtotal, clearCart } = useCart();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isGuest = !customer;

  // Shared state
  const [shippingMethods, setShippingMethods] = useState([]);
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [paymentMode, setPaymentMode] = useState('online');
  const [placing, setPlacing] = useState(false);

  // Signed-in state
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ full_name: '', phone_number: '', address_line1: '', address_line2: '', landmark: '', city: '', state: '', postal_code: '', address_type: 'home' });

  // Guest state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPhoneVerified, setGuestPhoneVerified] = useState(false);
  const [guestOtp, setGuestOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [guestAddress, setGuestAddress] = useState({ full_name: '', phone_number: '', address_line1: '', address_line2: '', landmark: '', city: '', state: '', postal_code: '' });

  useEffect(() => {
    supabase.from('shipping_methods').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) { setShippingMethods(data); if (data.length > 0) setSelectedMethodId(data[0].id); }
    });
    if (customer?.id) {
      supabase.from('customer_addresses').select('*').eq('customer_id', customer.id).then(({ data }) => {
        if (data) { setAddresses(data); const def = data.find(a => a.is_default) || data[0]; if (def) setSelectedAddressId(def.id); }
      });
    }
  }, [customer?.id]);

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
        <Link to="/products" className="text-sm hover:text-black">Browse Products</Link>
      </div>
    );
  }

  const selectedMethod = shippingMethods.find(m => m.id === selectedMethodId);
  const shippingCost = selectedMethod ? Number(selectedMethod.base_rate || 0) : 0;
  const freeShipping = selectedMethod?.free_above_amount && subtotal >= Number(selectedMethod.free_above_amount);
  const actualShipping = freeShipping ? 0 : shippingCost;
  const tax = subtotal * 0.18;
  const codFee = paymentMode === 'cod' && selectedMethod ? Number(selectedMethod.cod_fee || 0) : 0;
  const total = subtotal + tax + actualShipping + codFee;

  // Guest phone verification
  const handleSendGuestOtp = async () => {
    if (guestPhone.length !== 10) { toast({ title: 'Enter a valid 10-digit phone', variant: 'destructive' }); return; }
    setSendingOtp(true);
    try {
      await apiFetch('/api/guest/verify-phone/send', { method: 'POST', body: JSON.stringify({ phone: guestPhone }) });
      setOtpSent(true);
      toast({ title: 'Code sent', description: 'Check your WhatsApp or SMS.' });
    } catch (err) { toast({ title: 'Failed', description: err.message, variant: 'destructive' }); }
    finally { setSendingOtp(false); }
  };

  const handleVerifyGuestOtp = async () => {
    if (guestOtp.length !== 6) return;
    setVerifyingOtp(true);
    try {
      await apiFetch('/api/guest/verify-phone/confirm', { method: 'POST', body: JSON.stringify({ phone: guestPhone, otp: guestOtp }) });
      setGuestPhoneVerified(true);
      setGuestAddress(prev => ({ ...prev, phone_number: guestPhone }));
      toast({ title: 'Phone verified', variant: 'success' });
    } catch (err) { toast({ title: 'Invalid code', description: err.message, variant: 'destructive' }); }
    finally { setVerifyingOtp(false); }
  };

  const handleAddAddress = async () => {
    if (!newAddress.full_name || !newAddress.address_line1 || !newAddress.city || !newAddress.state || !newAddress.postal_code) {
      toast({ title: 'Missing fields', variant: 'destructive' }); return;
    }
    const { data } = await supabase.from('customer_addresses').insert({ ...newAddress, customer_id: customer.id, country: 'India' }).select('*').single();
    if (data) { setAddresses(prev => [...prev, data]); setSelectedAddressId(data.id); setShowAddAddress(false); toast({ title: 'Address added' }); }
  };

  const handlePlaceOrder = async () => {
    if (isGuest) {
      if (!guestPhoneVerified) { toast({ title: 'Phone verification required', variant: 'destructive' }); return; }
      if (!guestAddress.address_line1 || !guestAddress.city || !guestAddress.state || !guestAddress.postal_code) {
        toast({ title: 'Fill in delivery address', variant: 'destructive' }); return;
      }
    } else {
      if (!selectedAddressId) { toast({ title: 'Select address', variant: 'destructive' }); return; }
    }

    setPlacing(true);
    try {
      const orderBody = {
        items: items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
        shipping_method_id: selectedMethodId,
        payment_mode: paymentMode,
      };

      if (isGuest) {
        orderBody.guest_phone = guestPhone;
        orderBody.guest_name = guestName || guestAddress.full_name;
        orderBody.guest_email = guestEmail || null;
        orderBody.shipping_address = { ...guestAddress, full_name: guestName || guestAddress.full_name, phone_number: guestPhone, country: 'India' };
      } else {
        orderBody.customer_id = customer.id;
        orderBody.shipping_address_id = selectedAddressId;
      }

      const orderRes = await apiFetch('/api/order/create', { method: 'POST', body: JSON.stringify(orderBody) });

      if (paymentMode === 'cod') {
        await clearCart();
        toast({ title: 'Order placed!', description: `Order ${orderRes.orderNumber || ''} created.` });
        navigate(isGuest ? '/' : `/orders/${orderRes.orderId}`);
      } else {
        const payRes = await apiFetch('/api/payment/create-order', {
          method: 'POST',
          body: JSON.stringify({ amount: orderRes.total, customer_id: customer?.id || 'guest', order_id: orderRes.orderId }),
        });
        const options = {
          key: payRes.key || process.env.REACT_APP_RAZORPAY_KEY_ID,
          amount: payRes.amount,
          currency: payRes.currency,
          name: 'YA Commerce',
          description: `Order ${orderRes.orderNumber || ''}`,
          order_id: payRes.orderId,
          handler: async (response) => {
            await apiFetch('/api/payment/verify', { method: 'POST', body: JSON.stringify({ ...response, order_id: orderRes.orderId }) });
            await clearCart();
            toast({ title: 'Payment successful!' });
            navigate(isGuest ? '/' : `/orders/${orderRes.orderId}`);
          },
          prefill: { email: isGuest ? guestEmail : customer.email, contact: isGuest ? guestPhone : (customer.phone || '') },
          theme: { color: '#000000' },
        };
        if (window.Razorpay) { new window.Razorpay(options).open(); }
        else { toast({ title: 'Payment gateway not loaded', variant: 'destructive' }); }
      }
    } catch (err) { toast({ title: 'Order failed', description: err.message, variant: 'destructive' }); }
    finally { setPlacing(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8" data-testid="checkout-title">
        {isGuest ? 'Guest Checkout' : 'Checkout'}
      </h1>

      {isGuest && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 flex items-center gap-2 text-sm text-gray-600">
          <ShieldCheck size={16} /> Checking out as guest.
          <Link to="/auth" className="font-bold text-black hover:underline ml-1">Sign in</Link> for a better experience.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">

          {/* ── Guest: Phone Verification ──────────────────── */}
          {isGuest && (
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">
                <Phone size={14} className="inline mr-1" /> Phone Verification (Required)
              </h2>

              {guestPhoneVerified ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3" data-testid="phone-verified-badge">
                  <CheckCircle size={16} /> Phone +91 {guestPhone} verified
                </div>
              ) : !otpSent ? (
                <div className="space-y-3">
                  <div className="flex">
                    <span className="px-3 py-2.5 bg-gray-100 border border-r-0 border-gray-200 text-sm text-gray-500 font-semibold">+91</span>
                    <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210" maxLength={10} data-testid="guest-phone-input"
                      className="flex-1 px-4 py-2.5 border border-gray-200 text-sm focus:border-black focus:outline-none" />
                  </div>
                  <button onClick={handleSendGuestOtp} disabled={sendingOtp || guestPhone.length !== 10} data-testid="guest-send-otp-btn"
                    className="px-5 py-2.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50">
                    {sendingOtp ? 'Sending...' : 'SEND VERIFICATION CODE'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Code sent to +91 {guestPhone}</p>
                  <input type="text" value={guestOtp} onChange={e => setGuestOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000" maxLength={6} data-testid="guest-otp-input"
                    className="w-full px-4 py-2.5 border border-gray-200 text-sm text-center tracking-[0.5em] font-bold focus:border-black focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={handleVerifyGuestOtp} disabled={verifyingOtp || guestOtp.length !== 6} data-testid="guest-verify-otp-btn"
                      className="px-5 py-2.5 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50">
                      {verifyingOtp ? 'Verifying...' : 'VERIFY'}
                    </button>
                    <button onClick={() => { setOtpSent(false); setGuestOtp(''); }} className="px-5 py-2.5 border text-sm hover:bg-gray-50">Change Phone</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Guest: Contact Info ────────────────────────── */}
          {isGuest && guestPhoneVerified && (
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Contact Info</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full Name"
                  className="px-3 py-2.5 border border-gray-200 text-sm focus:border-black focus:outline-none" />
                <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="Email (optional)"
                  className="px-3 py-2.5 border border-gray-200 text-sm focus:border-black focus:outline-none" />
              </div>
            </div>
          )}

          {/* ── Guest: Delivery Address ────────────────────── */}
          {isGuest && guestPhoneVerified && (
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Delivery Address</h2>
              <div className="space-y-3">
                {['address_line1', 'address_line2', 'landmark', 'city', 'state', 'postal_code'].map(f => (
                  <input key={f} placeholder={f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={guestAddress[f]}
                    onChange={e => setGuestAddress(p => ({ ...p, [f]: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 text-sm focus:border-black focus:outline-none" />
                ))}
              </div>
            </div>
          )}

          {/* ── Signed-in: Addresses ───────────────────────── */}
          {!isGuest && (
            <div className="bg-white border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500">Delivery Address</h2>
                <button onClick={() => setShowAddAddress(!showAddAddress)} className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-black"><Plus size={14} /> Add New</button>
              </div>
              {showAddAddress && (
                <div className="border border-gray-200 p-4 mb-4 space-y-3">
                  {['full_name', 'phone_number', 'address_line1', 'address_line2', 'landmark', 'city', 'state', 'postal_code'].map(f => (
                    <input key={f} placeholder={f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={newAddress[f]}
                      onChange={e => setNewAddress(p => ({ ...p, [f]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-sm text-sm focus:border-black focus:outline-none" />
                  ))}
                  <div className="flex gap-2">
                    <button onClick={handleAddAddress} className="px-4 py-2 bg-black text-white text-sm font-bold hover:bg-gray-800">Save</button>
                    <button onClick={() => setShowAddAddress(false)} className="px-4 py-2 border text-sm hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {addresses.map(addr => (
                  <button key={addr.id} onClick={() => setSelectedAddressId(addr.id)} data-testid={`address-${addr.id}`}
                    className={`w-full text-left p-4 border transition-colors ${selectedAddressId === addr.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin size={14} className="text-gray-400" />
                      <span className="text-sm font-bold text-gray-900">{addr.full_name}</span>
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5">{addr.address_type}</span>
                    </div>
                    <p className="text-sm text-gray-600 font-light">{addr.address_line1}, {addr.city}, {addr.state} {addr.postal_code}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Shipping Method ─────────────────────────────── */}
          {shippingMethods.length > 0 && (isGuest ? guestPhoneVerified : true) && (
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Shipping Method</h2>
              <div className="space-y-2">
                {shippingMethods.map(m => (
                  <button key={m.id} onClick={() => setSelectedMethodId(m.id)} data-testid={`shipping-${m.id}`}
                    className={`w-full text-left p-4 border flex justify-between transition-colors ${selectedMethodId === m.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                    <div className="flex items-center gap-3"><Truck size={16} className="text-gray-400" /><div><p className="text-sm font-bold">{m.name}</p>{m.estimated_days_min && <p className="text-xs text-gray-500">{m.estimated_days_min}-{m.estimated_days_max} days</p>}</div></div>
                    <span className="font-bold">{m.free_above_amount && subtotal >= Number(m.free_above_amount) ? 'FREE' : formatPrice(m.base_rate)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Payment ─────────────────────────────────────── */}
          {(isGuest ? guestPhoneVerified : true) && (
            <div className="bg-white border border-gray-200 p-6">
              <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Payment Method</h2>
              <div className="space-y-2">
                <button onClick={() => setPaymentMode('online')} data-testid="pay-online"
                  className={`w-full text-left p-4 border flex items-center gap-3 transition-colors ${paymentMode === 'online' ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                  <CreditCard size={18} className="text-gray-500" /><div><p className="text-sm font-bold">Pay Online</p><p className="text-xs text-gray-500">UPI, Cards, Net Banking, Wallets</p></div>
                </button>
                <button onClick={() => setPaymentMode('cod')} data-testid="pay-cod"
                  className={`w-full text-left p-4 border flex items-center gap-3 transition-colors ${paymentMode === 'cod' ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}>
                  <Banknote size={18} className="text-gray-500" /><div><p className="text-sm font-bold">Cash on Delivery</p><p className="text-xs text-gray-500">Pay when you receive{codFee > 0 ? ` (+ ${formatPrice(codFee)} fee)` : ''}</p></div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Order Summary ──────────────────────────────── */}
        <div>
          <div className="bg-white border border-gray-200 p-6 sticky top-24">
            <h3 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm mb-4">
              {items.map(i => (
                <div key={i.id} className="flex justify-between"><span className="text-gray-600 truncate mr-2">{i.product_name} x{i.quantity}</span><span className="font-bold">{formatPrice(i.line_total)}</span></div>
              ))}
            </div>
            <div className="space-y-2 text-sm pt-4 border-t border-gray-200">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-bold">{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tax (GST 18%)</span><span className="font-bold">{formatPrice(tax)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span className="font-bold">{actualShipping === 0 ? 'FREE' : formatPrice(actualShipping)}</span></div>
              {codFee > 0 && <div className="flex justify-between"><span className="text-gray-600">COD Fee</span><span className="font-bold">{formatPrice(codFee)}</span></div>}
              <div className="pt-3 border-t flex justify-between"><span className="font-bold">Total</span><span className="font-black text-lg">{formatPrice(total)}</span></div>
            </div>
            <button onClick={handlePlaceOrder}
              disabled={placing || (isGuest ? !guestPhoneVerified : !selectedAddressId)} data-testid="place-order-btn"
              className="w-full mt-6 py-4 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {placing ? 'PLACING ORDER...' : paymentMode === 'cod' ? 'PLACE ORDER (COD)' : 'PROCEED TO PAY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
