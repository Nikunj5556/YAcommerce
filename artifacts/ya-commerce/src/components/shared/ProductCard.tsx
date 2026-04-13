import { Link } from "wouter";
import { Heart, Star } from "lucide-react";
import { formatPrice, getDiscountPercent } from "@/lib/format";

interface ProductCardProps {
  product: {
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
  };
}

export default function ProductCard({ product }: ProductCardProps) {
  const discount = getDiscountPercent(Number(product.base_price), product.compare_at_price ? Number(product.compare_at_price) : null);

  return (
    <Link href={`/products/${product.slug}`} data-testid={`card-product-${product.id}`}>
      <div className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-300">
        <div className="relative aspect-square bg-gray-100 overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <span className="text-4xl font-light">{product.name.charAt(0)}</span>
            </div>
          )}
          {discount > 0 && (
            <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded-md">
              -{discount}%
            </span>
          )}
          <button
            onClick={(e) => { e.preventDefault(); }}
            className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
          >
            <Heart size={16} className="text-gray-600" />
          </button>
        </div>
        <div className="p-4">
          {product.brand && (
            <p className="text-xs font-medium text-amber-600 mb-1 uppercase tracking-wide">{product.brand}</p>
          )}
          <h3 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2 group-hover:text-amber-700 transition-colors">
            {product.name}
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <span data-testid={`text-price-${product.id}`} className="text-lg font-bold text-gray-900">
              {formatPrice(product.base_price)}
            </span>
            {product.compare_at_price && Number(product.compare_at_price) > Number(product.base_price) && (
              <span className="text-sm text-gray-400 line-through">
                {formatPrice(product.compare_at_price)}
              </span>
            )}
          </div>
          {product.average_rating !== undefined && product.average_rating > 0 && (
            <div className="flex items-center gap-1">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="text-sm font-medium text-gray-700">{Number(product.average_rating).toFixed(1)}</span>
              {product.total_reviews !== undefined && (
                <span className="text-xs text-gray-400">({product.total_reviews})</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
