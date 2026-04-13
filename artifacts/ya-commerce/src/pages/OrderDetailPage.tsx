import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import {
  Package, CheckCircle, Truck, MapPin, CreditCard, Clock,
  Settings, Box, Bike, CircleDot, ChevronRight, ExternalLink
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice, formatDate, formatDateTime, getStatusColor, humanizeStatus } from "@/lib/format";

const EVENT_ICONS: Record<string, typeof Package> = {
  order_placed: CircleDot,
  payment_confirmed: CreditCard,
  confirmed: CheckCircle,
  processing: Settings,
  picking_started: Settings,
  packed: Box,
  dispatched: Truck,
  in_transit: MapPin,
  out_for_delivery: Bike,
  delivered: CheckCircle,
  attempted_delivery: Clock,
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { customer } = useAuth();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [shipments, setShipments] = useState<Array<Record<string, unknown>>>([]);
  const [trackingEvents, setTrackingEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      if (!id || !customer?.id) { setLoading(false); return; }
      try {
        const [orderRes, itemsRes, eventsRes, shipmentsRes] = await Promise.all([
          supabase.from("orders").select("*").eq("id", id).eq("customer_id", customer.id).maybeSingle(),
          supabase.from("order_items").select("*").eq("order_id", id),
          supabase.from("order_events").select("*").eq("order_id", id).order("created_at"),
          supabase.from("shipments").select("*").eq("order_id", id).eq("is_return_shipment", false),
        ]);

        if (orderRes.data) setOrder(orderRes.data);
        if (itemsRes.data) setItems(itemsRes.data);
        if (eventsRes.data) setEvents(eventsRes.data);
        if (shipmentsRes.data) {
          setShipments(shipmentsRes.data);
          if (shipmentsRes.data.length > 0) {
            const { data: trackEvents } = await supabase
              .from("shipment_tracking_events")
              .select("*")
              .in("shipment_id", shipmentsRes.data.map((s) => s.id))
              .order("event_time");
            if (trackEvents) setTrackingEvents(trackEvents);
          }
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id, customer?.id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="h-48 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h2>
        <Link href="/orders" className="text-amber-600 hover:text-amber-700 font-medium">Back to Orders</Link>
      </div>
    );
  }

  const allTimelineEvents = [
    ...events.map((e) => ({
      type: e.event_type as string,
      time: e.created_at as string,
      location: e.location as string | null,
      notes: e.notes as string | null,
      source: "order" as const,
    })),
    ...trackingEvents.map((te) => ({
      type: te.status as string,
      time: te.event_time as string,
      location: te.location as string | null,
      notes: te.description as string | null,
      source: "shipment" as const,
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const shipment = shipments[0] as Record<string, unknown> | undefined;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/orders" className="hover:text-amber-600">My Orders</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">{order.order_number as string}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order {order.order_number as string}</h1>
          <p className="text-sm text-gray-500 mt-1">Placed on {formatDate(order.purchase_date as string)}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(order.order_status as string)}`}>
          {humanizeStatus(order.order_status as string)}
        </span>
      </div>

      {/* Order Tracking Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Tracking</h2>
        
        {shipment && (
          <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            {shipment.carrier && (
              <div>
                <p className="text-xs text-gray-500">Carrier</p>
                <p className="text-sm font-medium text-gray-900">{shipment.carrier as string}</p>
              </div>
            )}
            {shipment.tracking_number && (
              <div>
                <p className="text-xs text-gray-500">Tracking Number</p>
                <p className="text-sm font-medium text-gray-900">{shipment.tracking_number as string}</p>
              </div>
            )}
            {shipment.awb_number && (
              <div>
                <p className="text-xs text-gray-500">AWB Number</p>
                <p className="text-sm font-medium text-gray-900">{shipment.awb_number as string}</p>
              </div>
            )}
            {shipment.estimated_delivery && (
              <div>
                <p className="text-xs text-gray-500">Expected Delivery</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(shipment.estimated_delivery as string)}</p>
              </div>
            )}
            {shipment.tracking_url && (
              <a
                href={shipment.tracking_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Track on Carrier Site <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

        {allTimelineEvents.length > 0 ? (
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
            {allTimelineEvents.map((event, index) => {
              const IconComponent = EVENT_ICONS[event.type] || CircleDot;
              const isLast = index === allTimelineEvents.length - 1;
              return (
                <div key={index} className="relative pb-6 last:pb-0">
                  <div className={`absolute -left-5 w-7 h-7 rounded-full flex items-center justify-center ${
                    isLast ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                    <IconComponent size={14} />
                  </div>
                  <div className="ml-4">
                    <p className={`font-medium text-sm ${isLast ? "text-gray-900" : "text-gray-700"}`}>
                      {humanizeStatus(event.type)}
                    </p>
                    {event.notes && <p className="text-xs text-gray-500 mt-0.5">{event.notes}</p>}
                    <div className="flex items-center gap-3 mt-0.5">
                      {event.location && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <MapPin size={10} /> {event.location}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDateTime(event.time)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Clock size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Tracking updates will appear here once your order is processed.</p>
          </div>
        )}
      </div>

      {/* Order Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Items</h2>
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id as string} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-medium text-gray-900 text-sm">{item.product_name_snapshot as string}</p>
                {item.variant_name_snapshot && (
                  <p className="text-xs text-gray-500">{item.variant_name_snapshot as string}</p>
                )}
                <p className="text-xs text-gray-400">Qty: {item.quantity as number}</p>
              </div>
              <span className="font-medium text-gray-900">{formatPrice(item.line_total as number)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{formatPrice(order.subtotal as number)}</span></div>
          {Number(order.discount_total) > 0 && (
            <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(order.discount_total as number)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-600">Tax</span><span>{formatPrice(order.tax_total as number)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span>{Number(order.shipping_total) === 0 ? "Free" : formatPrice(order.shipping_total as number)}</span></div>
          <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>{formatPrice(order.grand_total as number)}</span>
          </div>
          {order.is_cod && (
            <p className="text-xs text-amber-600 font-medium">Cash on Delivery</p>
          )}
        </div>
      </div>
    </div>
  );
}
