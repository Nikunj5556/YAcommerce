import React from 'react';
import { Star } from 'lucide-react';

export default function StarRating({ rating = 0, size = 16, interactive = false, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange?.(star)}
          className={interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}
          data-testid={`star-${star}`}
        >
          <Star
            size={size}
            className={star <= rating ? 'fill-amber-400 text-amber-400' : 'fill-none text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}
