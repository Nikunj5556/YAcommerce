import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Truck, Shield, RotateCcw, Headphones } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ProductCard from "@/components/shared/ProductCard";
import { ProductCardSkeleton } from "@/components/shared/Skeleton";

interface Product {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  compare_at_price: number | null;
  short_description: string | null;
  brand: string | null;
  image_url?: string | null;
  average_rating?: number;
  total_reviews?: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, categoriesRes, newRes] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, slug, base_price, compare_at_price, short_description, brand, product_media(url)")
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("categories")
            .select("id, name, slug, image_url")
            .eq("is_visible", true)
            .eq("is_featured", true)
            .order("sort_order")
            .limit(8),
          supabase
            .from("products")
            .select("id, name, slug, base_price, compare_at_price, short_description, brand, product_media(url)")
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

        if (productsRes.data) {
          const mapped = productsRes.data.map((p: Record<string, unknown>) => {
            const media = (p.product_media as Array<Record<string, unknown>>) || [];
            return {
              ...p,
              image_url: media[0]?.url || null,
            } as Product;
          });
          setFeaturedProducts(mapped);
        }

        if (categoriesRes.data) {
          setCategories(categoriesRes.data as Category[]);
        }

        if (newRes.data) {
          const mapped = newRes.data.map((p: Record<string, unknown>) => {
            const media = (p.product_media as Array<Record<string, unknown>>) || [];
            return {
              ...p,
              image_url: media[0]?.url || null,
            } as Product;
          });
          setNewArrivals(mapped);
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div>
      <section className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold mb-4 tracking-wide uppercase">
              New Season Collection
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4">
              Discover Quality,
              <span className="text-amber-600"> Delivered</span> to You
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-lg">
              Shop the finest products with fast delivery, easy returns, and secure payments. Your satisfaction is our priority.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/products"
                data-testid="link-shop-now"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/25"
              >
                Shop Now <ArrowRight size={18} />
              </Link>
              <Link
                href="/products?sort=newest"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
              >
                New Arrivals
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-amber-100/50 to-transparent hidden lg:block" />
      </section>

      <section className="py-4 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Truck, label: "Free Shipping", sub: "On orders above Rs.499" },
              { icon: Shield, label: "Secure Payments", sub: "100% protected" },
              { icon: RotateCcw, label: "Easy Returns", sub: "7-day return policy" },
              { icon: Headphones, label: "24/7 Support", sub: "We're here to help" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-3">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <item.icon size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Shop by Category</h2>
              <Link href="/products" className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <Link key={cat.id} href={`/products?category=${cat.slug}`} data-testid={`card-category-${cat.id}`}>
                  <div className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                    {cat.image_url ? (
                      <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-100 to-orange-100" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-semibold text-lg">{cat.name}</h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Featured Products</h2>
            <Link href="/products" className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Products coming soon. Check back later!</p>
            </div>
          )}
        </div>
      </section>

      {newArrivals.length > 0 && (
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">New Arrivals</h2>
              <Link href="/products?sort=newest" className="text-sm font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 bg-gradient-to-r from-amber-500 to-orange-500">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Stay in the Loop</h2>
          <p className="text-amber-100 mb-8 max-w-md mx-auto">Get exclusive deals, new arrivals, and more delivered to your inbox.</p>
          <form className="flex gap-3 max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            <button type="submit" className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors">
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
