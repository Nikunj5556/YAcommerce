import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck, Shield, RotateCcw, Headphones } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ProductCard from '../components/ProductCard';

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, categoriesRes, newRes] = await Promise.all([
          supabase.from('products')
            .select('id, name, slug, base_price, compare_at_price, short_description, brand, product_media(url)')
            .eq('status', 'active').order('created_at', { ascending: false }).limit(8),
          supabase.from('categories')
            .select('id, name, slug, image_url')
            .eq('is_visible', true).eq('is_featured', true).order('sort_order').limit(6),
          supabase.from('products')
            .select('id, name, slug, base_price, compare_at_price, short_description, brand, product_media(url)')
            .eq('status', 'active').order('created_at', { ascending: false }).limit(4),
        ]);
        if (productsRes.data) {
          setFeaturedProducts(productsRes.data.map(p => ({
            ...p, image_url: p.product_media?.[0]?.url || null,
          })));
        }
        if (categoriesRes.data) setCategories(categoriesRes.data);
        if (newRes.data) {
          setNewArrivals(newRes.data.map(p => ({
            ...p, image_url: p.product_media?.[0]?.url || null,
          })));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    fetchData();
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center overflow-hidden"
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/950241/pexels-photo-950241.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)',
          backgroundSize: 'cover', backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-white/40" />
        <div className="relative max-w-7xl mx-auto px-4 py-24">
          <p className="text-xs tracking-[0.3em] uppercase font-bold text-gray-500 mb-4" data-testid="hero-label">New Season Collection</p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-black leading-[0.9] max-w-3xl" data-testid="hero-title">
            Curated for<br/>the modern life.
          </h1>
          <p className="mt-6 text-lg font-light text-gray-700 max-w-lg leading-relaxed">
            Discover our handpicked selection of premium products, crafted with care and delivered to your doorstep.
          </p>
          <Link
            to="/products"
            data-testid="hero-cta"
            className="inline-flex items-center gap-2 mt-8 px-8 py-4 bg-black text-white font-bold text-sm tracking-wide hover:bg-gray-800 transition-colors duration-200 focus:ring-2 focus:ring-black focus:ring-offset-2"
          >
            SHOP NOW <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Truck, label: 'Free Delivery', sub: 'On orders above Rs.499' },
            { icon: Shield, label: 'Secure Checkout', sub: 'Razorpay protected' },
            { icon: RotateCcw, label: 'Easy Returns', sub: '7-day return policy' },
            { icon: Headphones, label: '24/7 Support', sub: 'We\'re here to help' },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <b.icon size={20} className="text-gray-900 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-900 tracking-wide">{b.label}</p>
                <p className="text-[10px] text-gray-500">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Shop by Category</h2>
            <Link to="/products" className="text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {categories.map(cat => (
              <Link key={cat.id} to={`/products?category=${cat.slug}`} data-testid={`category-${cat.slug}`}
                className="group relative aspect-[4/3] overflow-hidden bg-gray-100 border border-gray-200 hover:border-gray-900 transition-colors">
                {cat.image_url && (
                  <img src={cat.image_url} alt={cat.name}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <p className="text-white font-bold text-lg">{cat.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Featured Products</h2>
          <Link to="/products" className="text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black flex items-center gap-1">
            Shop All <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-sm" />
            ))}
          </div>
        ) : featuredProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 font-light">No products available yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {featuredProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* New Arrivals */}
      {newArrivals.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-8">New Arrivals</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {newArrivals.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-black text-white py-24">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-4">Ready to explore?</h2>
          <p className="text-gray-400 font-light mb-8 max-w-lg mx-auto">
            Browse our entire collection and find exactly what you're looking for.
          </p>
          <Link to="/products" data-testid="cta-browse"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-black font-bold text-sm tracking-wide hover:bg-gray-100 transition-colors">
            BROWSE COLLECTION <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
