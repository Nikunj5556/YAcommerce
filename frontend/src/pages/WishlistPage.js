import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice } from '../lib/format';

export default function WishlistPage() {
  const { customer } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!customer?.id) { setLoading(false); return; }
      const { data } = await supabase.from('wishlists')
        .select('id, product_id, products:product_id(id, name, slug, base_price, compare_at_price, brand, product_media(url))')
        .eq('customer_id', customer.id);
      if (data) setItems(data.map(w => ({ ...w, product: w.products })));
      setLoading(false);
    }
    fetch();
  }, [customer?.id]);

  const removeItem = async (id) => {
    await supabase.from('wishlists').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (!customer) return <div className="max-w-7xl mx-auto px-4 py-24 text-center"><Heart size={48} className="mx-auto mb-4 text-gray-300" /><h2 className="text-2xl font-bold mb-2">Sign in to view wishlist</h2><Link to="/auth" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm">Sign In</Link></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-6" data-testid="wishlist-title">Wishlist</h1>
      {loading ? <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton aspect-square" />)}</div>
      : items.length === 0 ? (
        <div className="text-center py-24">
          <Heart size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-2xl font-bold mb-2" data-testid="empty-wishlist">Your wishlist is empty</h2>
          <p className="text-gray-500 font-light mb-6">Save your favorite products here for later.</p>
          <Link to="/products" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">Browse Products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(item => {
            const p = item.product;
            if (!p) return null;
            return (
              <div key={item.id} className="bg-white border border-gray-200 group relative">
                <Link to={`/products/${p.slug}`}>
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    {p.product_media?.[0]?.url ? <img src={p.product_media[0].url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">{p.name?.charAt(0)}</div>}
                  </div>
                  <div className="p-4">
                    {p.brand && <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-gray-400 mb-1">{p.brand}</p>}
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2">{p.name}</h3>
                    <span className="text-base font-bold">{formatPrice(p.base_price)}</span>
                  </div>
                </Link>
                <button onClick={() => removeItem(item.id)} className="absolute top-2 right-2 p-2 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
