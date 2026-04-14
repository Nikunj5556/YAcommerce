import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, getStatusColor, humanizeStatus, formatPrice } from '../lib/format';

export default function ReturnsPage() {
  const { customer } = useAuth();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!customer?.id) { setLoading(false); return; }
      const { data } = await supabase.from('returns')
        .select('*, orders:order_id(order_number), return_items(product_name_snapshot, quantity_requested)')
        .eq('customer_id', customer.id).order('created_at', { ascending: false });
      if (data) setReturns(data);
      setLoading(false);
    }
    fetch();
  }, [customer?.id]);

  if (!customer) return <div className="max-w-7xl mx-auto px-4 py-24 text-center"><RotateCcw size={48} className="mx-auto mb-4 text-gray-300" /><h2 className="text-2xl font-bold mb-2">Sign in to view returns</h2><Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm">Sign In</Link></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6" data-testid="returns-title">Returns & Refunds</h1>
      {loading ? <div className="space-y-4">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      : returns.length === 0 ? (
        <div className="text-center py-24">
          <RotateCcw size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-2xl font-bold mb-2" data-testid="empty-returns">No return requests</h2>
          <p className="text-gray-500 font-light mb-6">You haven't made any return requests yet.</p>
          <Link to="/orders" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">View Orders</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map(ret => (
            <div key={ret.id} className="bg-white border border-gray-200 p-4 md:p-6" data-testid={`return-${ret.id}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-bold">{ret.return_number}</p>
                  <p className="text-xs text-gray-500">{formatDate(ret.created_at)} - Order {ret.orders?.order_number}</p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-bold ${getStatusColor(ret.return_status)}`}>{humanizeStatus(ret.return_status)}</span>
              </div>
              <p className="text-sm text-gray-600 font-light">Reason: {ret.reason}</p>
              {ret.refund_amount && <p className="text-sm font-bold mt-1">Refund: {formatPrice(ret.refund_amount)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
