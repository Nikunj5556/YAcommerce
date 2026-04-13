export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-100 animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-16" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-5 bg-gray-200 rounded w-20" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-4 bg-gray-200 rounded w-96" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
