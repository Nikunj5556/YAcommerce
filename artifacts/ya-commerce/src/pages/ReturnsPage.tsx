import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { RotateCcw, ChevronRight, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { uploadToS3 } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function ReturnsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { customer } = useAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [returnType, setReturnType] = useState("refund");
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("defective");
  const [comments, setComments] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function fetch() {
      if (!orderId || !customer?.id) return;
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).eq("customer_id", customer.id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", orderId),
      ]);
      if (orderRes.data) setOrder(orderRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
    }
    fetch();
  }, [orderId, customer?.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToS3(file, "ya-commerce/returns");
        setEvidenceImages((prev) => [...prev, url]);
      }
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!order || !customer) return;
    setSubmitting(true);
    try {
      await supabase.from("returns").insert({
        order_id: orderId,
        customer_id: customer.id,
        return_type: returnType,
        return_status: "requested",
        reason,
        reason_category: reasonCategory,
        customer_comments: comments,
        evidence_image_urls: evidenceImages,
      });

      await supabase.from("order_events").insert({
        order_id: orderId,
        event_type: "return_requested",
        actor: "customer",
        notes: `Return requested: ${reasonCategory} - ${reason}`,
      });

      toast({ title: "Return requested", description: "Your return request has been submitted." });
    } catch {
      toast({ title: "Failed", description: "Could not submit return request.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Order not found</h2>
        <Link href="/orders" className="text-amber-600 hover:text-amber-700">Back to Orders</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/orders" className="hover:text-amber-600">My Orders</Link>
        <ChevronRight size={14} />
        <Link href={`/orders/${orderId}`} className="hover:text-amber-600">{order.order_number as string}</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Return Request</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <RotateCcw size={24} className="text-amber-600" /> Request Return
      </h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Order Items</h2>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id as string} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.product_name_snapshot as string}</p>
                {item.variant_name_snapshot && <p className="text-xs text-gray-500">{item.variant_name_snapshot as string}</p>}
              </div>
              <span className="text-sm text-gray-600">Qty: {item.quantity as number}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Return Type</label>
          <select value={returnType} onChange={(e) => setReturnType(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm">
            <option value="refund">Refund</option>
            <option value="exchange">Exchange</option>
            <option value="replacement">Replacement</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason Category</label>
          <select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm">
            <option value="defective">Defective Product</option>
            <option value="wrong_item">Wrong Item Received</option>
            <option value="damaged_in_transit">Damaged in Transit</option>
            <option value="not_as_described">Not as Described</option>
            <option value="size_issue">Size Issue</option>
            <option value="quality_issue">Quality Issue</option>
            <option value="changed_mind">Changed Mind</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason for return" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Additional Comments</label>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Evidence Photos</label>
          <div className="flex gap-2 flex-wrap">
            {evidenceImages.map((url, i) => (
              <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
            ))}
            <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-amber-500">
              <Upload size={20} className="text-gray-400" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </label>
            {uploading && <span className="text-xs text-gray-500 self-center">Uploading...</span>}
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !reason}
          className="px-6 py-3 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Return Request"}
        </button>
      </div>
    </div>
  );
}
