import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, CheckCircle, Truck, MapPin, CreditCard, Clock, Settings, Box, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice, formatDate, formatDateTime, getStatusColor, humanizeStatus } from '../lib/format';

const EVENT_ICONS = {
  order_placed: Package, payment_confirmed: CreditCard, confirmed: CheckCircle,
  processing: Settings, picking_started: Settings, packed: Box,
  dispatched: Truck, in_transit: MapPin, out_for_delivery: Truck, delivered: CheckCircle, attempted_delivery: Clock,
  label_created: Package, pickup_scheduled: Package, picked_up: Truck,
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const { customer } = useAuth();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      if (!id || !customer?.id) { setLoading(false); return; }
      const [orderRes, itemsRes, eventsRes, shipmentsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', id).eq('customer_id', customer.id).maybeSingle(),
        supabase.from('order_items').select('*').eq('order_id', id),
        supabase.from('order_events').select('*').eq('order_id', id).order('created_at'),
        supabase.from('shipments').select('*').eq('order_id', id).eq('is_return_shipment', false),
      ]);
      if (orderRes.data) setOrder(orderRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      if (eventsRes.data) setEvents(eventsRes.data);
      if (shipmentsRes.data) {
        setShipments(shipmentsRes.data);
        if (shipmentsRes.data.length > 0) {
          const { data: te } = await supabase.from('shipment_tracking_events').select('*')
            .in('shipment_id', shipmentsRes.data.map(s => s.id)).order('event_time');
          if (te) setTrackingEvents(te);
        }
      }
      setLoading(false);
    }
    fetchOrder();
  }, [id, customer?.id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 space-y-6"><div className="skeleton h-8 w-64" /><div className="skeleton h-48" /><div className="skeleton h-64" /></div>;
  if (!order) return <div className="max-w-4xl mx-auto px-4 py-16 text-center"><h2 className="text-2xl font-bold">Order Not Found</h2><Link to="/orders" className="text-sm text-gray-500 hover:text-black mt-2 inline-block">Back to Orders</Link></div>;

  const allTimeline = [
    ...events.map(e => ({ type: e.event_type, time: e.created_at, location: e.location, notes: e.notes, source: 'order' })),
    ...trackingEvents.map(te => ({ type: te.status, time: te.event_time, location: te.location, notes: te.description, source: 'shipment' })),
  ].sort((a, b) => new Date(a.time) - new Date(b.time));

  const shipment = shipments[0];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link to="/orders" className="hover:text-black">My Orders</Link><ChevronRight size={12} />
        <span className="text-gray-900 font-bold">{order.order_number}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900" data-testid="order-number">Order {order.order_number}</h1>
          <p className="text-sm text-gray-500 mt-1">Placed on {formatDate(order.purchase_date)}</p>
        </div>
        <span className={`px-3 py-1.5 text-sm font-bold ${getStatusColor(order.order_status)}`} data-testid="order-status">{humanizeStatus(order.order_status)}</span>
      </div>

      {/* Tracking Timeline */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-6">Order Tracking</h2>
        {shipment && (
          <div className="flex flex-wrap gap-6 mb-6 p-4 bg-gray-50 border border-gray-200">
            {shipment.carrier && <div><p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-400">Carrier</p><p className="text-sm font-bold text-gray-900">{shipment.carrier}</p></div>}
            {shipment.tracking_number && <div><p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-400">Tracking Number</p><p className="text-sm font-bold text-gray-900">{shipment.tracking_number}</p></div>}
            {shipment.awb_number && <div><p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-400">AWB</p><p className="text-sm font-bold text-gray-900">{shipment.awb_number}</p></div>}
            {shipment.estimated_delivery && <div><p className="text-[10px] tracking-[0.15em] uppercase font-bold text-gray-400">Est. Delivery</p><p className="text-sm font-bold text-gray-900">{formatDate(shipment.estimated_delivery)}</p></div>}
            {shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-bold text-brand-accent hover:underline"><ExternalLink size={14} /> Track on carrier</a>}
          </div>
        )}
        {allTimeline.length > 0 ? (
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
            {allTimeline.map((ev, i) => {
              const Icon = EVENT_ICONS[ev.type] || Package;
              const isLast = i === allTimeline.length - 1;
              return (
                <div key={i} className="relative pb-6 last:pb-0" data-testid={`timeline-event-${i}`}>
                  <div className={`absolute left-[-1.25rem] w-6 h-6 rounded-full flex items-center justify-center ${isLast ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <Icon size={12} />
                  </div>
                  <div className="ml-4">
                    <p className={`text-sm font-bold ${isLast ? 'text-gray-900' : 'text-gray-600'}`}>{humanizeStatus(ev.type)}</p>
                    {ev.notes && <p className="text-xs text-gray-500 font-light mt-0.5">{ev.notes}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">{formatDateTime(ev.time)}</span>
                      {ev.location && <span className="text-[10px] text-gray-400">- {ev.location}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 font-light text-sm">Order placed. Tracking events will appear here once your order is processed.</p>
        )}
      </div>

      {/* Order Items */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Items</h2>
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.product_name_snapshot}</p>
                {item.variant_name_snapshot && <p className="text-xs text-gray-500">{item.variant_name_snapshot}</p>}
                <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
              </div>
              <span className="font-bold text-gray-900">{formatPrice(item.line_total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-white border border-gray-200 p-6">
        <h2 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-bold">{formatPrice(order.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Tax</span><span className="font-bold">{formatPrice(order.tax_total)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span className="font-bold">{formatPrice(order.shipping_total)}</span></div>
          {order.cod_fee > 0 && <div className="flex justify-between"><span className="text-gray-600">COD Fee</span><span className="font-bold">{formatPrice(order.cod_fee)}</span></div>}
          <div className="pt-2 border-t flex justify-between"><span className="font-bold">Total</span><span className="font-black text-lg">{formatPrice(order.grand_total)}</span></div>
        </div>
        {order.is_cod && <p className="mt-3 text-xs text-amber-600 font-bold">Cash on Delivery</p>}
      </div>
    </div>
  );
}
