import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ProductCard from '../components/ProductCard';

export default function ProductListPage() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [showFilters, setShowFilters] = useState(false);
  const search = searchParams.get('search') || '';

  useEffect(() => {
    supabase.from('categories').select('id, name, slug').eq('is_visible', true).order('sort_order')
      .then(({ data }) => { if (data) setCategories(data); });
  }, []);

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      let query = supabase.from('products')
        .select('id, name, slug, base_price, compare_at_price, short_description, brand, category_id, product_media(url), product_review_stats(average_rating, total_reviews)')
        .eq('status', 'active');

      if (search) query = query.ilike('name', `%${search}%`);
      if (selectedCategory) {
        const cat = categories.find(c => c.slug === selectedCategory);
        if (cat) query = query.eq('category_id', cat.id);
      }
      query = query.gte('base_price', priceRange[0]).lte('base_price', priceRange[1]);

      if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
      else if (sortBy === 'price_low') query = query.order('base_price', { ascending: true });
      else if (sortBy === 'price_high') query = query.order('base_price', { ascending: false });
      else if (sortBy === 'popular') query = query.order('created_at', { ascending: false });

      query = query.limit(50);
      const { data } = await query;
      if (data) {
        setProducts(data.map(p => ({
          ...p,
          image_url: p.product_media?.[0]?.url || null,
          average_rating: p.product_review_stats?.[0]?.average_rating || 0,
          total_reviews: p.product_review_stats?.[0]?.total_reviews || 0,
        })));
      }
      setLoading(false);
    }
    fetchProducts();
  }, [sortBy, selectedCategory, priceRange, search, categories]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb & Title */}
      <div className="mb-8">
        <nav className="flex items-center gap-2 text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-black">Home</Link>
          <span>/</span>
          <span className="text-gray-900 font-bold">Products</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
          {search ? `Results for "${search}"` : selectedCategory ? categories.find(c => c.slug === selectedCategory)?.name || 'Products' : 'All Products'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{products.length} products</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
        <button onClick={() => setShowFilters(!showFilters)} data-testid="filter-toggle"
          className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black">
          <SlidersHorizontal size={16} /> Filters
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs tracking-[0.15em] uppercase font-bold text-gray-400">Sort</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} data-testid="sort-select"
            className="text-sm bg-transparent border-0 font-semibold text-gray-900 focus:ring-0 cursor-pointer">
            <option value="newest">Newest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="popular">Popular</option>
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Filters Sidebar */}
        {showFilters && (
          <aside className="w-56 flex-shrink-0 space-y-6">
            <div>
              <h3 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-3">Category</h3>
              <div className="space-y-1">
                <button onClick={() => setSelectedCategory('')}
                  className={`block w-full text-left text-sm py-1 ${!selectedCategory ? 'font-bold text-black' : 'text-gray-600 hover:text-black'}`}>
                  All
                </button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setSelectedCategory(c.slug)}
                    className={`block w-full text-left text-sm py-1 ${selectedCategory === c.slug ? 'font-bold text-black' : 'text-gray-600 hover:text-black'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-3">Price Range</h3>
              <div className="space-y-2">
                {[[0, 500], [500, 1000], [1000, 5000], [5000, 10000], [0, 100000]].map(([min, max], i) => (
                  <button key={i} onClick={() => setPriceRange([min, max])}
                    className={`block w-full text-left text-sm py-1 ${priceRange[0] === min && priceRange[1] === max ? 'font-bold text-black' : 'text-gray-600 hover:text-black'}`}>
                    {max === 100000 ? 'All Prices' : `Rs.${min} - Rs.${max}`}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Product Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="skeleton aspect-square" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-2xl font-bold text-gray-900 mb-2">No products found</p>
              <p className="text-gray-500 font-light mb-6">Try adjusting your filters or search terms.</p>
              <Link to="/products" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">
                View All Products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
