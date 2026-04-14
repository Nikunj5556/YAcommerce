import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const CartContext = createContext({
  items: [], cartId: null, loading: false, itemCount: 0, subtotal: 0,
  addToCart: async () => {}, removeFromCart: async () => {},
  updateQuantity: async () => {}, clearCart: async () => {},
});

const CART_KEY = 'ya_commerce_cart';

function getLocalCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

function setLocalCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function CartProvider({ children }) {
  const { customer } = useAuth();
  const [items, setItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!customer?.id) { setItems(getLocalCart()); return; }
    setLoading(true);
    try {
      let { data: cart } = await supabase.from('carts').select('id')
        .eq('customer_id', customer.id).eq('status', 'active').maybeSingle();
      if (!cart) {
        const { data: newCart } = await supabase.from('carts')
          .insert({ customer_id: customer.id, status: 'active', currency: 'INR', subtotal: 0, total: 0 })
          .select('id').single();
        cart = newCart;
      }
      if (cart) {
        setCartId(cart.id);
        const { data: cartItems } = await supabase.from('cart_items')
          .select('id, product_id, variant_id, quantity, unit_price, compare_price, line_total')
          .eq('cart_id', cart.id);
        if (cartItems) {
          const mapped = await Promise.all(cartItems.map(async (ci) => {
            const { data: prod } = await supabase.from('products')
              .select('name, slug, product_media(url)').eq('id', ci.product_id).maybeSingle();
            const media = prod?.product_media || [];
            return {
              id: ci.id, product_id: ci.product_id, variant_id: ci.variant_id,
              quantity: ci.quantity, unit_price: Number(ci.unit_price),
              compare_price: ci.compare_price ? Number(ci.compare_price) : null,
              line_total: Number(ci.line_total),
              product_name: prod?.name || '', product_slug: prod?.slug || '',
              product_image: media[0]?.url || null, variant_name: null,
            };
          }));
          setItems(mapped);
        }
      }
    } catch { setItems(getLocalCart()); }
    finally { setLoading(false); }
  }, [customer?.id]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const addToCart = async (product) => {
    if (!customer?.id) {
      const existing = items.find(i => i.product_id === product.product_id && i.variant_id === (product.variant_id || null));
      let newItems;
      if (existing) {
        newItems = items.map(i => i.id === existing.id
          ? { ...i, quantity: i.quantity + product.quantity, line_total: (i.quantity + product.quantity) * i.unit_price } : i);
      } else {
        newItems = [...items, {
          id: crypto.randomUUID(), product_id: product.product_id,
          variant_id: product.variant_id || null, quantity: product.quantity,
          unit_price: product.unit_price, compare_price: product.compare_price || null,
          line_total: product.quantity * product.unit_price,
          product_name: product.product_name, product_image: product.product_image || null,
          variant_name: product.variant_name || null, product_slug: product.product_slug,
        }];
      }
      setItems(newItems); setLocalCart(newItems); return;
    }
    if (!cartId) return;
    const { data: existing } = await supabase.from('cart_items').select('id, quantity')
      .eq('cart_id', cartId).eq('product_id', product.product_id).maybeSingle();
    if (existing) {
      await supabase.from('cart_items').update({
        quantity: existing.quantity + product.quantity,
        line_total: (existing.quantity + product.quantity) * product.unit_price,
      }).eq('id', existing.id);
    } else {
      await supabase.from('cart_items').insert({
        cart_id: cartId, product_id: product.product_id, variant_id: product.variant_id || null,
        quantity: product.quantity, unit_price: product.unit_price,
        compare_price: product.compare_price || null, line_total: product.quantity * product.unit_price,
      });
    }
    await fetchCart();
  };

  const removeFromCart = async (itemId) => {
    if (!customer?.id) {
      const n = items.filter(i => i.id !== itemId); setItems(n); setLocalCart(n); return;
    }
    await supabase.from('cart_items').delete().eq('id', itemId);
    await fetchCart();
  };

  const updateQuantity = async (itemId, quantity) => {
    if (quantity <= 0) { await removeFromCart(itemId); return; }
    if (!customer?.id) {
      const n = items.map(i => i.id === itemId ? { ...i, quantity, line_total: quantity * i.unit_price } : i);
      setItems(n); setLocalCart(n); return;
    }
    const item = items.find(i => i.id === itemId);
    if (item) {
      await supabase.from('cart_items').update({ quantity, line_total: quantity * item.unit_price }).eq('id', itemId);
      await fetchCart();
    }
  };

  const clearCart = async () => {
    if (!customer?.id) { setItems([]); localStorage.removeItem(CART_KEY); return; }
    if (cartId) { await supabase.from('cart_items').delete().eq('cart_id', cartId); await fetchCart(); }
  };

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);

  return (
    <CartContext.Provider value={{ items, cartId, loading, itemCount, subtotal, addToCart, removeFromCart, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }
