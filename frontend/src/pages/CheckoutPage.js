import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapPin, Plus, Truck, CreditCard, Banknote, ChevronRight } from 'lucide-react';
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

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [paymentMode, setPaymentMode] = useState('online');
  const [placing, setPlacing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ full_name: '', phone_number: '', address_line1: '', address_line2: '', landmark: '', city: '', state: '', postal_code: '', address_type: 'home' });

  useEffect(() => {
    if (!customer?.id) return;
    supabase.from('customer_addresses').select('*').eq('customer_id', customer.id).then(({ data }) => {
      if (data) { setAddresses(data); const def = data.find(a => a.is_default) || data[0]; if (def) setSelectedAddressId(def.id); }
    });
    supabase.from('shipping_methods').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) { setShippingMethods(data); if (data.length > 0) setSelectedMethodId(data[0].id); }
    });
  }, [customer?.id]);

  if (!customer) return <div className="max-w-4xl mx-auto px-4 py-16 text-center"><h2 className="text-2xl font-bold mb-2">Sign in to continue</h2><Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm">Sign In</Link></div>;
  if (items.length === 0) return <div className="max-w-4xl mx-auto px-4 py-16 text-center"><h2 className="text-2xl font-bold mb-2">Your cart is empty</h2><Link to="/products" className="text-sm hover:text-black">Browse Products</Link></div>;

  const selectedMethod = shippingMethods.find(m => m.id === selectedMethodId);
  const shippingCost = selectedMethod ? Number(selectedMethod.base_rate || 0) : 0;
  const freeShipping = selectedMethod && selectedMethod.free_above_amount && subtotal >= Number(selectedMethod.free_above_amount);
  const actualShipping = freeShipping ? 0 : shippingCost;
  const tax = subtotal * 0.18;
  const codFee = paymentMode === 'cod' && selectedMethod ? Number(selectedMethod.cod_fee || 0) : 0;
  const total = subtotal + tax + actualShipping + codFee;

  const handleAddAddress = async () => {
    if (!newAddress.full_name || !newAddress.address_line1 || !newAddress.city || !newAddress.state || !newAddress.postal_code) {
      toast({ title: 'Missing fields', description: 'Please fill all required address fields.', variant: 'destructive' }); return;
    }
    const { data } = await supabase.from('customer_addresses').insert({ ...newAddress, customer_id: customer.id, country: 'India' }).select('*').single();
    if (data) { setAddresses(prev => [...prev, data]); setSelectedAddressId(data.id); setShowAddAddress(false); toast({ title: 'Address added' }); }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) { toast({ title: 'Select address', variant: 'destructive' }); return; }
    setPlacing(true);
    try {
      const orderRes = await apiFetch('/api/order/create', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customer.id,
          items: items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
          shipping_address_id: selectedAddressId,
          shipping_method_id: selectedMethodId,
          payment_mode: paymentMode,
        }),
      });

      if (paymentMode === 'cod') {
        await clearCart();
        toast({ title: 'Order placed!', description: `Order ${orderRes.orderNumber} created.` });
        navigate(`/orders/${orderRes.orderId}`);
      } else {
        const payRes = await apiFetch('/api/payment/create-order', {
          method: 'POST',
          body: JSON.stringify({ amount: orderRes.total, customer_id: customer.id, order_id: orderRes.orderId }),
        });

        const options = {
          key: payRes.key || process.env.REACT_APP_RAZORPAY_KEY_ID,
          amount: payRes.amount,
          currency: payRes.currency,
          name: 'YA Commerce',
          description: `Order ${orderRes.orderNumber}`,
          order_id: payRes.orderId,
          handler: async (response) => {
            await apiFetch('/api/payment/verify', {
              method: 'POST',
              body: JSON.stringify({ ...response, order_id: orderRes.orderId }),
            });
            await clearCart();
            toast({ title: 'Payment successful!', description: `Order ${orderRes.orderNumber} confirmed.` });
            navigate(`/orders/${orderRes.orderId}`);
          },
          prefill: { email: customer.email, contact: customer.phone || '' },
          theme: { color: '#000000' },
        };

        if (window.Razorpay) {
          const rzp = new window.Razorpay(options);
          rzp.open();
        } else {
          toast({ title: 'Payment gateway not loaded', variant: 'destructive' });
        }
      }
    } catch (err) { toast({ title: 'Order failed', description: err.message, variant: 'destructive' }); }
    finally { setPlacing(false); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-8" data-testid="checkout-title">Checkout</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Addresses */}
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
                  <button onClick={handleAddAddress} className="px-4 py-2 bg-black text-white text-sm font-bold hover:bg-gray-800">Save Address</button>
                  <button onClick={() => setShowAddAddress(false)} className="px-4 py-2 border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
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

          {/* Shipping Method */}
          {shippingMethods.length > 0 && (
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

          {/* Payment */}
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
        </div>

        {/* Order Summary */}
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
            <button onClick={handlePlaceOrder} disabled={placing || !selectedAddressId} data-testid="place-order-btn"
              className="w-full mt-6 py-4 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {placing ? 'PLACING ORDER...' : paymentMode === 'cod' ? 'PLACE ORDER (COD)' : 'PROCEED TO PAY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
