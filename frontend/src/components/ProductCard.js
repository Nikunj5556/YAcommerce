import React from 'react';
import { Link } from 'react-router-dom';
import { formatPrice, getDiscountPercent } from '../lib/format';
import StarRating from './StarRating';

export default function ProductCard({ product }) {
  const discount = getDiscountPercent(Number(product.base_price), product.compare_at_price ? Number(product.compare_at_price) : null);

  return (
    <Link
      to={`/products/${product.slug}`}
      data-testid={`product-card-${product.slug}`}
      className="group block bg-white border border-gray-200 hover:border-gray-900 transition-colors duration-200"
    >
      <div className="aspect-square overflow-hidden bg-gray-50 relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl font-light">
            {product.name?.charAt(0)}
          </div>
        )}
        {discount > 0 && (
          <span className="absolute top-3 left-3 bg-black text-white text-[10px] tracking-[0.15em] uppercase font-bold px-2 py-1">
            {discount}% off
          </span>
        )}
      </div>
      <div className="p-4">
        {product.brand && (
          <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-gray-400 mb-1">{product.brand}</p>
        )}
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-2 group-hover:text-black">{product.name}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-gray-900">{formatPrice(product.base_price)}</span>
          {product.compare_at_price && Number(product.compare_at_price) > Number(product.base_price) && (
            <span className="text-xs text-gray-400 line-through">{formatPrice(product.compare_at_price)}</span>
          )}
        </div>
        {product.average_rating > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <StarRating rating={Math.round(product.average_rating)} size={12} />
            <span className="text-[10px] text-gray-400">({product.total_reviews})</span>
          </div>
        )}
      </div>
    </Link>
  );
}
