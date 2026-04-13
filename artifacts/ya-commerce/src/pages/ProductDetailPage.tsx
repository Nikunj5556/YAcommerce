import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { ShoppingBag, Heart, Truck, RotateCcw, Shield, ChevronRight, Star, CheckCircle, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice, getDiscountPercent, formatDate } from "@/lib/format";
import { uploadToS3 } from "@/lib/api";
import StarRating from "@/components/shared/StarRating";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();
  const { customer } = useAuth();
  const { toast } = useToast();

  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [media, setMedia] = useState<Array<{ url: string; media_type: string; alt_text: string | null }>>([]);
  const [variants, setVariants] = useState<Array<Record<string, unknown>>>([]);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, unknown> | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [reviewStats, setReviewStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      setLoading(true);
      try {
        const { data: prod } = await supabase
          .from("products")
          .select("*")
          .eq("slug", slug)
          .eq("status", "active")
          .maybeSingle();

        if (!prod) { setLoading(false); return; }
        setProduct(prod);

        const [mediaRes, variantsRes, reviewsRes, statsRes] = await Promise.all([
          supabase.from("product_media").select("*").eq("product_id", prod.id).order("sort_order"),
          supabase.from("product_variants").select("*").eq("product_id", prod.id).eq("is_active", true),
          supabase
            .from("product_reviews")
            .select("*, customers:customer_id(full_name, profile_image)")
            .eq("product_id", prod.id)
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("product_review_stats").select("*").eq("product_id", prod.id).maybeSingle(),
        ]);

        if (mediaRes.data) setMedia(mediaRes.data);
        if (variantsRes.data) {
          setVariants(variantsRes.data);
          if (variantsRes.data.length > 0) setSelectedVariant(variantsRes.data[0]);
        }
        if (reviewsRes.data) setReviews(reviewsRes.data);
        if (statsRes.data) setReviewStats(statsRes.data);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchProduct();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-square bg-gray-200 rounded-xl" />
          <div className="space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-6 bg-gray-200 rounded w-1/4" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h2>
        <p className="text-gray-500 mb-6">This product may have been removed or is no longer available.</p>
        <Link href="/products" className="inline-flex items-center px-6 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600">
          Browse Products
        </Link>
      </div>
    );
  }

  const currentPrice = selectedVariant ? Number(selectedVariant.price || product.base_price) : Number(product.base_price);
  const comparePrice = selectedVariant ? Number(selectedVariant.compare_at_price || product.compare_at_price || 0) : Number(product.compare_at_price || 0);
  const discount = getDiscountPercent(currentPrice, comparePrice || null);
  const gstRate = Number(product.gst_rate || 0);
  const gstAmount = (currentPrice * gstRate) / 100;

  const handleAddToCart = async () => {
    await addToCart({
      product_id: product.id as string,
      variant_id: selectedVariant?.id as string | undefined,
      quantity,
      unit_price: currentPrice,
      compare_price: comparePrice || null,
      product_name: product.name as string,
      product_image: media[0]?.url || null,
      variant_name: selectedVariant?.variant_name as string | null,
      product_slug: product.slug as string,
    });
    toast({ title: "Added to cart", description: `${product.name} has been added to your cart.` });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploadingMedia(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadToS3(file, "ya-commerce/reviews");
        urls.push(url);
      }
      setReviewImages((prev) => [...prev, ...urls]);
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the file. Please try again.", variant: "destructive" });
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!customer) {
      toast({ title: "Sign in required", description: "Please sign in to write a review.", variant: "destructive" });
      return;
    }
    setSubmittingReview(true);
    try {
      await supabase.from("product_reviews").insert({
        product_id: product.id,
        customer_id: customer.id,
        variant_id: selectedVariant?.id || null,
        rating: reviewRating,
        title: reviewTitle,
        body: reviewBody,
        image_urls: reviewImages,
        status: "pending",
      });
      toast({ title: "Review submitted", description: "Thank you! Your review will appear after approval." });
      setReviewTitle("");
      setReviewBody("");
      setReviewRating(5);
      setReviewImages([]);
    } catch {
      toast({ title: "Failed", description: "Could not submit review. Please try again.", variant: "destructive" });
    } finally {
      setSubmittingReview(false);
    }
  };

  const attributes = selectedVariant?.attributes as Record<string, string> | undefined;
  const uniqueAttributes: Record<string, string[]> = {};
  variants.forEach((v) => {
    const attrs = v.attributes as Record<string, string> | undefined;
    if (attrs) {
      Object.entries(attrs).forEach(([key, val]) => {
        if (!uniqueAttributes[key]) uniqueAttributes[key] = [];
        if (!uniqueAttributes[key].includes(val)) uniqueAttributes[key].push(val);
      });
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-amber-600">Home</Link>
        <ChevronRight size={14} />
        <Link href="/products" className="hover:text-amber-600">Products</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium truncate">{product.name as string}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        <div>
          <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-4">
            {media.length > 0 ? (
              <img src={media[selectedImage]?.url} alt={media[selectedImage]?.alt_text || product.name as string} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-6xl font-light">
                {(product.name as string).charAt(0)}
              </div>
            )}
          </div>
          {media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {media.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === selectedImage ? "border-amber-500" : "border-transparent hover:border-gray-300"}`}
                >
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {product.brand && (
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-1">{product.brand as string}</p>
          )}
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">{product.name as string}</h1>

          {reviewStats && Number(reviewStats.total_reviews) > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <StarRating rating={Number(reviewStats.average_rating)} size={16} />
              <span className="text-sm font-medium text-gray-700">{Number(reviewStats.average_rating).toFixed(1)}</span>
              <span className="text-sm text-gray-400">({reviewStats.total_reviews as number} reviews)</span>
            </div>
          )}

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-3xl font-bold text-gray-900">{formatPrice(currentPrice)}</span>
            {comparePrice > currentPrice && (
              <>
                <span className="text-lg text-gray-400 line-through">{formatPrice(comparePrice)}</span>
                <span className="text-sm font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  {discount}% off
                </span>
              </>
            )}
          </div>
          {gstRate > 0 && (
            <p className="text-xs text-gray-500 mb-4">Inclusive of GST ({gstRate}%: {formatPrice(gstAmount)})</p>
          )}

          {Object.entries(uniqueAttributes).map(([attrKey, values]) => (
            <div key={attrKey} className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">{attrKey}</label>
              <div className="flex flex-wrap gap-2">
                {values.map((val) => {
                  const isSelected = attributes?.[attrKey] === val;
                  return (
                    <button
                      key={val}
                      onClick={() => {
                        const v = variants.find((vr) => {
                          const attrs = vr.attributes as Record<string, string> | undefined;
                          return attrs?.[attrKey] === val;
                        });
                        if (v) setSelectedVariant(v);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        isSelected
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
            <div className="flex items-center border border-gray-200 rounded-lg w-fit">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 py-2 text-gray-600 hover:bg-gray-50">-</button>
              <span className="px-4 py-2 font-medium text-gray-900 min-w-[3rem] text-center">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="px-4 py-2 text-gray-600 hover:bg-gray-50">+</button>
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              data-testid="button-add-to-cart"
              onClick={handleAddToCart}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors"
            >
              <ShoppingBag size={18} /> Add to Cart
            </button>
            <button className="p-3.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-red-500 transition-colors">
              <Heart size={20} />
            </button>
          </div>

          <div className="space-y-3 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Truck size={18} className="text-amber-600" />
              <span>Free delivery on orders above Rs.499</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <RotateCcw size={18} className="text-amber-600" />
              <span>Easy 7-day returns</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Shield size={18} className="text-amber-600" />
              <span>Secure checkout with Razorpay</span>
            </div>
          </div>

          {product.full_description && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{product.full_description as string}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reviews Section */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Reviews</h2>

        {reviewStats && Number(reviewStats.total_reviews) > 0 ? (
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="text-center md:text-left">
              <div className="text-5xl font-bold text-gray-900 mb-1">{Number(reviewStats.average_rating).toFixed(1)}</div>
              <StarRating rating={Math.round(Number(reviewStats.average_rating))} size={20} />
              <p className="text-sm text-gray-500 mt-1">Based on {reviewStats.total_reviews as number} reviews</p>
            </div>
            <div className="md:col-span-2 space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = Number(reviewStats[`${["one", "two", "three", "four", "five"][star - 1]}_star_count`] || 0);
                const pct = Number(reviewStats.total_reviews) > 0 ? (count / Number(reviewStats.total_reviews)) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-8">{star}<Star size={12} className="inline ml-0.5 fill-amber-400 text-amber-400" /></span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 mb-8">No reviews yet. Be the first to review this product!</p>
        )}

        {reviews.length > 0 && (
          <div className="space-y-6 mb-8">
            {reviews.map((review) => {
              const cust = review.customers as Record<string, unknown> | null;
              return (
                <div key={review.id as string} className="bg-white rounded-xl border border-gray-100 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {cust?.profile_image ? (
                        <img src={cust.profile_image as string} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-semibold text-sm">
                          {((cust?.full_name as string) || "A").charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{(cust?.full_name as string) || "Anonymous"}</p>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating as number} size={14} />
                          {review.verified_purchase && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle size={12} /> Verified Purchase
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(review.created_at as string)}</span>
                  </div>
                  {review.title && <h4 className="font-semibold text-gray-900 mb-1">{review.title as string}</h4>}
                  {review.body && <p className="text-gray-600 text-sm">{review.body as string}</p>}
                  {(review.image_urls as string[])?.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {(review.image_urls as string[]).map((url, i) => (
                        <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  {review.staff_response && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Store Response</p>
                      <p className="text-sm text-gray-700">{review.staff_response as string}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Write a Review</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
              <StarRating rating={reviewRating} size={24} interactive onChange={setReviewRating} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="Summarize your experience"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review</label>
              <textarea
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="Share your thoughts about this product"
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Photos / Videos</label>
              <div className="flex items-center gap-3">
                {reviewImages.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                ))}
                <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-amber-500 transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                </label>
                {uploadingMedia && <span className="text-xs text-gray-500">Uploading...</span>}
              </div>
            </div>
            <button
              onClick={handleSubmitReview}
              disabled={submittingReview || !reviewRating}
              className="px-6 py-2.5 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
