import { useEffect, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import ProductCard from "@/components/shared/ProductCard";
import EmptyState from "@/components/shared/EmptyState";
import { ProductCardSkeleton } from "@/components/shared/Skeleton";

export default function WishlistPage() {
  const { customer } = useAuth();
  const [wishlistItems, setWishlistItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!customer?.id) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from("wishlists")
          .select("id, product_id, products:product_id(id, name, slug, base_price, compare_at_price, short_description, brand, product_media(url))")
          .eq("customer_id", customer.id)
          .order("added_at", { ascending: false });
        if (data) setWishlistItems(data);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [customer?.id]);

  const handleRemove = async (wishlistId: string) => {
    await supabase.from("wishlists").delete().eq("id", wishlistId);
    setWishlistItems((prev) => prev.filter((w) => w.id !== wishlistId));
  };

  if (!customer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <EmptyState icon={Heart} title="Sign in to view wishlist" description="Please sign in to see your saved items." actionLabel="Sign In" actionHref="/auth" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Wishlist</h1>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : wishlistItems.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save items you love for later! Browse our collection and tap the heart icon."
          actionLabel="Explore Products"
          actionHref="/products"
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {wishlistItems.map((item) => {
            const product = item.products as Record<string, unknown> | null;
            if (!product) return null;
            const media = (product.product_media as Array<Record<string, unknown>>) || [];
            return (
              <div key={item.id as string} className="relative">
                <ProductCard
                  product={{
                    id: product.id as string,
                    name: product.name as string,
                    slug: product.slug as string,
                    base_price: Number(product.base_price),
                    compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
                    short_description: product.short_description as string | null,
                    brand: product.brand as string | null,
                    image_url: (media[0]?.url as string) || null,
                  }}
                />
                <button
                  onClick={() => handleRemove(item.id as string)}
                  className="absolute top-3 right-3 z-10 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
