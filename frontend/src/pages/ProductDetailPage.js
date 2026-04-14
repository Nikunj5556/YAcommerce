import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShoppingBag, Heart, Truck, RotateCcw, Shield, ChevronRight, Star, CheckCircle, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice, getDiscountPercent, formatDate } from '../lib/format';
import { uploadToS3 } from '../lib/api';
import StarRating from '../components/StarRating';
import { useToast } from '../contexts/ToastContext';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { addToCart } = useCart();
  const { customer } = useAuth();
  const { toast } = useToast();

  const [product, setProduct] = useState(null);
  const [media, setMedia] = useState([]);
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewImages, setReviewImages] = useState([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      setLoading(true);
      try {
        const { data: prod } = await supabase.from('products').select('*').eq('slug', slug).eq('status', 'active').maybeSingle();
        if (!prod) { setLoading(false); return; }
        setProduct(prod);

        const [mediaRes, variantsRes, reviewsRes, statsRes] = await Promise.all([
          supabase.from('product_media').select('*').eq('product_id', prod.id).order('sort_order'),
          supabase.from('product_variants').select('*').eq('product_id', prod.id).eq('is_active', true),
          supabase.from('product_reviews')
            .select('*, customers:customer_id(full_name, profile_image)')
            .eq('product_id', prod.id).eq('status', 'approved')
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('product_review_stats').select('*').eq('product_id', prod.id).maybeSingle(),
        ]);

        if (mediaRes.data) setMedia(mediaRes.data);
        if (variantsRes.data) { setVariants(variantsRes.data); if (variantsRes.data.length > 0) setSelectedVariant(variantsRes.data[0]); }
        if (reviewsRes.data) setReviews(reviewsRes.data);
        if (statsRes.data) setReviewStats(statsRes.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    if (slug) fetchProduct();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="skeleton aspect-square" />
          <div className="space-y-4"><div className="skeleton h-8 w-3/4" /><div className="skeleton h-6 w-1/4" /><div className="skeleton h-4 w-full" /></div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
        <p className="text-gray-500 mb-6 font-light">This product may have been removed or is no longer available.</p>
        <Link to="/products" className="inline-flex px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800">Browse Products</Link>
      </div>
    );
  }

  const currentPrice = selectedVariant ? Number(selectedVariant.price || product.base_price) : Number(product.base_price);
  const comparePrice = selectedVariant ? Number(selectedVariant.compare_at_price || product.compare_at_price || 0) : Number(product.compare_at_price || 0);
  const discount = getDiscountPercent(currentPrice, comparePrice || null);
  const gstRate = Number(product.gst_rate || 0);

  const handleAddToCart = async () => {
    await addToCart({
      product_id: product.id, variant_id: selectedVariant?.id, quantity,
      unit_price: currentPrice, compare_price: comparePrice || null,
      product_name: product.name, product_image: media[0]?.url || null,
      variant_name: selectedVariant?.variant_name || null, product_slug: product.slug,
    });
    toast({ title: 'Added to cart', description: `${product.name} has been added.` });
  };

  const handleMediaUpload = async (e) => {
    const files = e.target.files;
    if (!files) return;
    setUploadingMedia(true);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const url = await uploadToS3(file, 'ya-commerce/reviews');
        urls.push(url);
      }
      setReviewImages(prev => [...prev, ...urls]);
    } catch { toast({ title: 'Upload failed', variant: 'destructive' }); }
    finally { setUploadingMedia(false); }
  };

  const handleSubmitReview = async () => {
    if (!customer) { toast({ title: 'Sign in required', description: 'Please sign in to write a review.', variant: 'destructive' }); return; }
    setSubmittingReview(true);
    try {
      await supabase.from('product_reviews').insert({
        product_id: product.id, customer_id: customer.id,
        variant_id: selectedVariant?.id || null, rating: reviewRating,
        title: reviewTitle, body: reviewBody, image_urls: reviewImages, status: 'pending',
      });
      toast({ title: 'Review submitted', description: 'Thank you! Your review will appear after approval.' });
      setReviewTitle(''); setReviewBody(''); setReviewRating(5); setReviewImages([]);
    } catch { toast({ title: 'Failed', variant: 'destructive' }); }
    finally { setSubmittingReview(false); }
  };

  const uniqueAttributes = {};
  variants.forEach(v => {
    const attrs = v.attributes || {};
    Object.entries(attrs).forEach(([key, val]) => {
      if (!uniqueAttributes[key]) uniqueAttributes[key] = [];
      if (!uniqueAttributes[key].includes(val)) uniqueAttributes[key].push(val);
    });
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link to="/" className="hover:text-black">Home</Link><ChevronRight size={12} />
        <Link to="/products" className="hover:text-black">Products</Link><ChevronRight size={12} />
        <span className="text-gray-900 font-bold truncate">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <div>
          <div className="aspect-square overflow-hidden bg-gray-50 border border-gray-200 mb-4">
            {media.length > 0 ? (
              <img src={media[selectedImage]?.url} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-6xl font-light">{product.name.charAt(0)}</div>
            )}
          </div>
          {media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {media.map((m, i) => (
                <button key={i} onClick={() => setSelectedImage(i)}
                  className={`flex-shrink-0 w-16 h-16 overflow-hidden border-2 transition-colors ${i === selectedImage ? 'border-black' : 'border-transparent hover:border-gray-300'}`}>
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {product.brand && <p className="text-xs tracking-[0.2em] uppercase font-bold text-gray-400 mb-1">{product.brand}</p>}
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-gray-900 mb-3">{product.name}</h1>

          {reviewStats && Number(reviewStats.total_reviews) > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <StarRating rating={Math.round(Number(reviewStats.average_rating))} size={16} />
              <span className="text-sm font-semibold">{Number(reviewStats.average_rating).toFixed(1)}</span>
              <span className="text-sm text-gray-400">({reviewStats.total_reviews} reviews)</span>
            </div>
          )}

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-3xl font-black text-gray-900">{formatPrice(currentPrice)}</span>
            {comparePrice > currentPrice && (
              <>
                <span className="text-lg text-gray-400 line-through">{formatPrice(comparePrice)}</span>
                <span className="text-xs font-bold bg-black text-white px-2 py-0.5">{discount}% OFF</span>
              </>
            )}
          </div>
          {gstRate > 0 && <p className="text-xs text-gray-500 mb-4">Inclusive of GST ({gstRate}%)</p>}

          {/* Variant selectors */}
          {Object.entries(uniqueAttributes).map(([attrKey, values]) => (
            <div key={attrKey} className="mb-4">
              <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-2">{attrKey}</label>
              <div className="flex flex-wrap gap-2">
                {values.map(val => {
                  const isSelected = selectedVariant?.attributes?.[attrKey] === val;
                  return (
                    <button key={val}
                      onClick={() => { const v = variants.find(vr => vr.attributes?.[attrKey] === val); if (v) setSelectedVariant(v); }}
                      className={`px-4 py-2 text-sm font-semibold border transition-colors ${isSelected ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-700 hover:border-black'}`}>
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quantity */}
          <div className="mb-6">
            <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-2">Quantity</label>
            <div className="flex items-center border border-gray-200 w-fit">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 py-2 text-gray-600 hover:bg-gray-50 font-bold">-</button>
              <span className="px-4 py-2 font-bold text-gray-900 min-w-[3rem] text-center">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="px-4 py-2 text-gray-600 hover:bg-gray-50 font-bold">+</button>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <button data-testid="add-to-cart-btn" onClick={handleAddToCart}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors focus:ring-2 focus:ring-black focus:ring-offset-2">
              <ShoppingBag size={18} /> ADD TO CART
            </button>
            <button data-testid="wishlist-btn" className="p-4 border border-gray-200 text-gray-600 hover:border-black hover:text-black transition-colors">
              <Heart size={20} />
            </button>
          </div>

          <div className="space-y-3 py-4 border-t border-gray-200">
            <div className="flex items-center gap-3 text-sm text-gray-600"><Truck size={16} /> Free delivery above Rs.499</div>
            <div className="flex items-center gap-3 text-sm text-gray-600"><RotateCcw size={16} /> Easy 7-day returns</div>
            <div className="flex items-center gap-3 text-sm text-gray-600"><Shield size={16} /> Secure checkout</div>
          </div>

          {product.full_description && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-3">Description</h3>
              <p className="text-sm text-gray-600 font-light leading-relaxed whitespace-pre-line">{product.full_description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reviews Section */}
      <div className="mt-16 pt-8 border-t border-gray-200">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-8">Customer Reviews</h2>

        {reviewStats && Number(reviewStats.total_reviews) > 0 ? (
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="text-5xl font-black text-gray-900 mb-1">{Number(reviewStats.average_rating).toFixed(1)}</div>
              <StarRating rating={Math.round(Number(reviewStats.average_rating))} size={20} />
              <p className="text-sm text-gray-500 mt-1">Based on {reviewStats.total_reviews} reviews</p>
            </div>
            <div className="md:col-span-2 space-y-2">
              {[5, 4, 3, 2, 1].map(star => {
                const count = Number(reviewStats[`${['one','two','three','four','five'][star-1]}_star_count`] || 0);
                const pct = Number(reviewStats.total_reviews) > 0 ? (count / Number(reviewStats.total_reviews)) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-8">{star}<Star size={12} className="inline ml-0.5 fill-amber-400 text-amber-400" /></span>
                    <div className="flex-1 h-2 bg-gray-100 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 font-light mb-8">No reviews yet. Be the first to review this product!</p>
        )}

        {/* Individual reviews */}
        {reviews.length > 0 && (
          <div className="space-y-4 mb-8">
            {reviews.map(review => {
              const cust = review.customers;
              return (
                <div key={review.id} className="bg-white border border-gray-200 p-6" data-testid={`review-${review.id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {cust?.profile_image ? (
                        <img src={cust.profile_image} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-sm">
                          {(cust?.full_name || 'A').charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{cust?.full_name || 'Anonymous'}</p>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} size={14} />
                          {review.verified_purchase && (
                            <span className="flex items-center gap-1 text-[10px] text-green-600 font-bold"><CheckCircle size={12} /> Verified</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(review.created_at)}</span>
                  </div>
                  {review.title && <h4 className="font-bold text-gray-900 mb-1">{review.title}</h4>}
                  {review.body && <p className="text-gray-600 text-sm font-light">{review.body}</p>}
                  {review.image_urls?.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {review.image_urls.map((url, i) => (
                        <img key={i} src={url} alt="" className="w-16 h-16 object-cover border border-gray-200" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Write review form */}
        <div className="border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Write a Review</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-2">Rating</label>
              <StarRating rating={reviewRating} size={24} interactive onChange={setReviewRating} />
            </div>
            <div>
              <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Title</label>
              <input value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} placeholder="Summarize your experience"
                data-testid="review-title-input"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black" />
            </div>
            <div>
              <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-1">Review</label>
              <textarea value={reviewBody} onChange={e => setReviewBody(e.target.value)} placeholder="Share your thoughts"
                data-testid="review-body-input" rows={4}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black resize-none" />
            </div>
            <div>
              <label className="block text-xs tracking-[0.15em] uppercase font-bold text-gray-500 mb-2">Photos / Videos</label>
              <div className="flex items-center gap-3">
                {reviewImages.map((url, i) => <img key={i} src={url} alt="" className="w-16 h-16 object-cover border" />)}
                <label className="w-16 h-16 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-black transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                </label>
                {uploadingMedia && <span className="text-xs text-gray-500">Uploading...</span>}
              </div>
            </div>
            <button onClick={handleSubmitReview} disabled={submittingReview || !reviewRating}
              data-testid="submit-review-btn"
              className="px-6 py-3 bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
              {submittingReview ? 'Submitting...' : 'SUBMIT REVIEW'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
