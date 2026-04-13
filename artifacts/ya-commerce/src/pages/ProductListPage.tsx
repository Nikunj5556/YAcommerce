import { useEffect, useState, useMemo } from "react";
import { useSearch } from "wouter";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
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
}

export default function ProductListPage() {
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const categorySlug = params.get("category");
  const sortBy = params.get("sort") || "newest";
  const searchQuery = params.get("search") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100000]);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name, slug")
      .eq("is_visible", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategories(data);
      });
  }, []);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        let query = supabase
          .from("products")
          .select("id, name, slug, base_price, compare_at_price, short_description, brand, category_id, product_media(url), product_review_stats(average_rating, total_reviews)", { count: "exact" })
          .eq("status", "active")
          .gte("base_price", priceRange[0])
          .lte("base_price", priceRange[1])
          .range((page - 1) * pageSize, page * pageSize - 1);

        if (categorySlug) {
          const { data: cat } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
          if (cat) {
            query = query.eq("category_id", cat.id);
          }
        }

        if (searchQuery) {
          query = query.ilike("name", `%${searchQuery}%`);
        }

        switch (sortBy) {
          case "price_low":
            query = query.order("base_price", { ascending: true });
            break;
          case "price_high":
            query = query.order("base_price", { ascending: false });
            break;
          case "popular":
            query = query.order("base_price", { ascending: false });
            break;
          default:
            query = query.order("created_at", { ascending: false });
        }

        const { data } = await query;
        if (data) {
          const mapped = data.map((p: Record<string, unknown>) => {
            const media = (p.product_media as Array<Record<string, unknown>>) || [];
            const stats = (p.product_review_stats as Array<Record<string, unknown>>) || [];
            return {
              id: p.id,
              name: p.name,
              slug: p.slug,
              base_price: p.base_price,
              compare_at_price: p.compare_at_price,
              short_description: p.short_description,
              brand: p.brand,
              image_url: media[0]?.url || null,
              average_rating: stats[0]?.average_rating || 0,
              total_reviews: stats[0]?.total_reviews || 0,
            } as Product;
          });
          setProducts(mapped);
        }
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, [categorySlug, sortBy, searchQuery, priceRange, page]);

  const currentCategory = categories.find((c) => c.slug === categorySlug);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {searchQuery ? `Results for "${searchQuery}"` : currentCategory ? currentCategory.name : "All Products"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{products.length} products found</p>
      </div>

      <div className="flex items-center justify-between mb-6 gap-4">
        <button
          data-testid="button-filters"
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal size={16} />
          Filters
          {showFilters && <X size={14} />}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:block">Sort by:</span>
          <select
            data-testid="select-sort"
            value={sortBy}
            onChange={(e) => {
              const newParams = new URLSearchParams(searchString);
              newParams.set("sort", e.target.value);
              window.history.pushState({}, "", `?${newParams}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="newest">Newest First</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Categories</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchString);
                    newParams.delete("category");
                    window.history.pushState({}, "", `?${newParams}`);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                  className={`block w-full text-left px-3 py-1.5 rounded-md text-sm ${!categorySlug ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      const newParams = new URLSearchParams(searchString);
                      newParams.set("category", cat.slug);
                      window.history.pushState({}, "", `?${newParams}`);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    className={`block w-full text-left px-3 py-1.5 rounded-md text-sm ${categorySlug === cat.slug ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Price Range</h3>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceRange[0] || ""}
                  onChange={(e) => setPriceRange([Number(e.target.value) || 0, priceRange[1]])}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={priceRange[1] >= 100000 ? "" : priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value) || 100000])}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-8">
            {page > 1 && (
              <button onClick={() => setPage(page - 1)} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Previous
              </button>
            )}
            <span className="px-4 py-2 text-sm text-gray-600">Page {page}</span>
            {products.length === pageSize && (
              <button onClick={() => setPage(page + 1)} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Next
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ChevronDown size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500">Try adjusting your filters or search terms.</p>
        </div>
      )}
    </div>
  );
}
