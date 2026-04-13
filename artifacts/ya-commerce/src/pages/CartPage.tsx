import { Link } from "wouter";
import { Trash2, ShoppingBag, Plus, Minus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { formatPrice } from "@/lib/format";
import EmptyState from "@/components/shared/EmptyState";

export default function CartPage() {
  const { items, subtotal, removeFromCart, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Shopping Cart</h1>
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Looks like you haven't added anything yet. Start browsing our collection and find something you love!"
          actionLabel="Start Shopping"
          actionHref="/products"
        />
      </div>
    );
  }

  const estimatedTax = subtotal * 0.18;
  const shipping = subtotal >= 499 ? 0 : 49;
  const total = subtotal + estimatedTax + shipping;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Shopping Cart ({items.length} items)</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div key={item.id} data-testid={`card-cart-item-${item.id}`} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4">
              <Link href={`/products/${item.product_slug}`} className="flex-shrink-0">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                  {item.product_image ? (
                    <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-light">
                      {item.product_name.charAt(0)}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/products/${item.product_slug}`}>
                  <h3 className="font-medium text-gray-900 text-sm hover:text-amber-600 transition-colors line-clamp-2">{item.product_name}</h3>
                </Link>
                {item.variant_name && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.variant_name}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-bold text-gray-900">{formatPrice(item.unit_price)}</span>
                  {item.compare_price && Number(item.compare_price) > item.unit_price && (
                    <span className="text-sm text-gray-400 line-through">{formatPrice(item.compare_price)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-gray-200 rounded-lg">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="p-1.5 text-gray-500 hover:text-gray-700"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="px-3 text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="p-1.5 text-gray-500 hover:text-gray-700"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    data-testid={`button-remove-${item.id}`}
                    onClick={() => removeFromCart(item.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Estimated Tax (GST 18%)</span>
                <span className="font-medium">{formatPrice(estimatedTax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-medium">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-amber-600">Add {formatPrice(499 - subtotal)} more for free shipping</p>
              )}
              <div className="border-t border-gray-100 pt-3 flex justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-lg text-gray-900">{formatPrice(total)}</span>
              </div>
            </div>
            <Link
              href="/checkout"
              data-testid="link-checkout"
              className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors"
            >
              Proceed to Checkout
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
