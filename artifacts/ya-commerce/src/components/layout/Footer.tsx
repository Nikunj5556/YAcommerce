import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">YA</span>
              </div>
              <span className="text-lg font-bold text-white">YA Commerce</span>
            </div>
            <p className="text-sm text-gray-400">Your trusted destination for quality products.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Shop</h4>
            <div className="space-y-2">
              <Link href="/products" className="block text-sm hover:text-amber-400 transition-colors">All Products</Link>
              <Link href="/products?sort=newest" className="block text-sm hover:text-amber-400 transition-colors">New Arrivals</Link>
              <Link href="/products?sort=popular" className="block text-sm hover:text-amber-400 transition-colors">Best Sellers</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Account</h4>
            <div className="space-y-2">
              <Link href="/account" className="block text-sm hover:text-amber-400 transition-colors">My Account</Link>
              <Link href="/orders" className="block text-sm hover:text-amber-400 transition-colors">My Orders</Link>
              <Link href="/wishlist" className="block text-sm hover:text-amber-400 transition-colors">Wishlist</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Help</h4>
            <div className="space-y-2">
              <Link href="/support" className="block text-sm hover:text-amber-400 transition-colors">Support</Link>
              <Link href="/support" className="block text-sm hover:text-amber-400 transition-colors">Returns</Link>
              <Link href="/support" className="block text-sm hover:text-amber-400 transition-colors">Shipping Info</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          2024 YA Commerce. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
