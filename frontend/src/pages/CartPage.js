import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ShoppingBag, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { formatPrice } from '../lib/format';

export default function CartPage() {
  const { items, subtotal, removeFromCart, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={48} className="mx-auto mb-4 text-gray-300" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-2" data-testid="empty-cart-title">Your cart is empty</h1>
        <p className="text-gray-500 font-light mb-8 max-w-md mx-auto">
          Looks like you haven't added anything yet. Start browsing our collection and find something you love!
        </p>
        <Link to="/products" data-testid="start-shopping-btn"
          className="inline-flex items-center gap-2 px-8 py-4 bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors">
          START SHOPPING <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const tax = subtotal * 0.18;
  const shipping = subtotal >= 499 ? 0 : 49;
  const total = subtotal + tax + shipping;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6" data-testid="cart-title">Shopping Cart ({items.length})</h1>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-3">
          {items.map(item => (
            <div key={item.id} data-testid={`cart-item-${item.id}`} className="bg-white border border-gray-200 p-4 flex gap-4">
              <Link to={`/products/${item.product_slug}`} className="flex-shrink-0">
                <div className="w-24 h-24 overflow-hidden bg-gray-50">
                  {item.product_image ? (
                    <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-light">{item.product_name.charAt(0)}</div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/products/${item.product_slug}`}>
                  <h3 className="font-semibold text-gray-900 text-sm hover:text-black line-clamp-2">{item.product_name}</h3>
                </Link>
                {item.variant_name && <p className="text-xs text-gray-500 mt-0.5">{item.variant_name}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-bold text-gray-900">{formatPrice(item.unit_price)}</span>
                  {item.compare_price && Number(item.compare_price) > item.unit_price && (
                    <span className="text-sm text-gray-400 line-through">{formatPrice(item.compare_price)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center border border-gray-200">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1.5 text-gray-500 hover:text-gray-700" data-testid={`qty-minus-${item.id}`}><Minus size={14} /></button>
                    <span className="px-3 text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1.5 text-gray-500 hover:text-gray-700" data-testid={`qty-plus-${item.id}`}><Plus size={14} /></button>
                  </div>
                  <button data-testid={`remove-${item.id}`} onClick={() => removeFromCart(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="bg-white border border-gray-200 p-6 sticky top-24">
            <h3 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Order Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-bold">{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">GST (18%)</span><span className="font-bold">{formatPrice(tax)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span className="font-bold">{shipping === 0 ? 'FREE' : formatPrice(shipping)}</span></div>
              {shipping > 0 && <p className="text-xs text-gray-400">Free shipping on orders above Rs.499</p>}
              <div className="pt-3 border-t border-gray-200 flex justify-between text-base">
                <span className="font-bold">Total</span><span className="font-black text-lg">{formatPrice(total)}</span>
              </div>
            </div>
            <Link to="/checkout" data-testid="checkout-btn"
              className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors">
              PROCEED TO CHECKOUT <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
