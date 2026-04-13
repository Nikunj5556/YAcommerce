import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Package, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice, formatDate, getStatusColor, humanizeStatus } from "@/lib/format";
import EmptyState from "@/components/shared/EmptyState";

export default function OrdersPage() {
  const { customer } = useAuth();
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (!customer?.id) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from("orders")
          .select("id, order_number, order_status, payment_status, grand_total, purchase_date, order_items(product_name_snapshot, quantity)")
          .eq("customer_id", customer.id)
          .order("purchase_date", { ascending: false });
        if (data) setOrders(data);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [customer?.id]);

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <EmptyState
          icon={Package}
          title="Sign in to view orders"
          description="Please sign in to see your order history."
          actionLabel="Sign In"
          actionHref="/auth"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Orders</h1>

      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="When you place your first order, it will appear here. Start exploring our products!"
          actionLabel="Browse Products"
          actionHref="/products"
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const items = (order.order_items as Array<Record<string, unknown>>) || [];
            return (
              <Link key={order.id as string} href={`/orders/${order.id}`} data-testid={`card-order-${order.id}`}>
                <div className="bg-white rounded-xl border border-gray-100 p-4 md:p-6 hover:border-gray-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-gray-500">Order {order.order_number as string}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.purchase_date as string)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(order.order_status as string)}`}>
                        {humanizeStatus(order.order_status as string)}
                      </span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700 line-clamp-1">
                      {items.map((i) => `${i.product_name_snapshot} x${i.quantity}`).join(", ") || "Order items"}
                    </p>
                    <span className="font-bold text-gray-900">{formatPrice(order.grand_total as number)}</span>
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
