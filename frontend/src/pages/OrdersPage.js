import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice, formatDate, getStatusColor, humanizeStatus } from '../lib/format';

export default function OrdersPage() {
  const { customer } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (!customer?.id) { setLoading(false); return; }
      const { data } = await supabase.from('orders')
        .select('id, order_number, order_status, payment_status, grand_total, purchase_date, order_items(product_name_snapshot, quantity)')
        .eq('customer_id', customer.id).order('purchase_date', { ascending: false });
      if (data) setOrders(data);
      setLoading(false);
    }
    fetchOrders();
  }, [customer?.id]);

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <Package size={48} className="mx-auto mb-4 text-gray-300" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to view orders</h2>
        <p className="text-gray-500 font-light mb-6">Please sign in to see your order history.</p>
        <Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">Sign In</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24" />)}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6" data-testid="orders-title">My Orders</h1>
      {orders.length === 0 ? (
        <div className="text-center py-24">
          <Package size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2" data-testid="empty-orders-title">No orders yet</h2>
          <p className="text-gray-500 font-light mb-6">When you place your first order, it will appear here.</p>
          <Link to="/products" data-testid="browse-products-btn" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">Browse Products</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const items = order.order_items || [];
            return (
              <Link key={order.id} to={`/orders/${order.id}`} data-testid={`order-${order.id}`}>
                <div className="bg-white border border-gray-200 p-4 md:p-6 hover:border-gray-900 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{order.order_number}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(order.purchase_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 text-xs font-bold ${getStatusColor(order.order_status)}`}>{humanizeStatus(order.order_status)}</span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 font-light line-clamp-1">
                      {items.map(i => `${i.product_name_snapshot} x${i.quantity}`).join(', ') || 'Order items'}
                    </p>
                    <span className="font-black text-gray-900">{formatPrice(order.grand_total)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
