import { Link, useLocation } from "wouter";
import { ShoppingBag, Heart, User, Search, Menu, X, Package } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";

export default function Header() {
  const { customer } = useAuth();
  const { itemCount } = useCart();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              data-testid="button-mobile-menu"
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <Link href="/" data-testid="link-home" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">YA</span>
              </div>
              <span className="text-xl font-bold text-gray-900 hidden sm:block">YA Commerce</span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/products" data-testid="link-products" className="text-sm font-medium text-gray-600 hover:text-amber-600 transition-colors">
              Shop
            </Link>
            <Link href="/products?sort=newest" data-testid="link-new-arrivals" className="text-sm font-medium text-gray-600 hover:text-amber-600 transition-colors">
              New Arrivals
            </Link>
            <Link href="/products?sort=popular" data-testid="link-best-sellers" className="text-sm font-medium text-gray-600 hover:text-amber-600 transition-colors">
              Best Sellers
            </Link>
          </nav>

          <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                data-testid="input-search"
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            {customer && (
              <Link href="/orders" data-testid="link-orders" className="p-2 text-gray-600 hover:text-amber-600 transition-colors relative">
                <Package size={20} />
              </Link>
            )}
            <Link href="/wishlist" data-testid="link-wishlist" className="p-2 text-gray-600 hover:text-amber-600 transition-colors">
              <Heart size={20} />
            </Link>
            <Link href="/cart" data-testid="link-cart" className="p-2 text-gray-600 hover:text-amber-600 transition-colors relative">
              <ShoppingBag size={20} />
              {itemCount > 0 && (
                <span data-testid="text-cart-count" className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[10px] font-bold w-4.5 h-4.5 flex items-center justify-center rounded-full">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>
            <Link
              href={customer ? "/account" : "/auth"}
              data-testid="link-account"
              className="p-2 text-gray-600 hover:text-amber-600 transition-colors"
            >
              {customer?.profile_image ? (
                <img src={customer.profile_image} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <User size={20} />
              )}
            </Link>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-100 py-4 space-y-2">
            <form onSubmit={handleSearch} className="mb-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </form>
            <Link href="/products" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              Shop All
            </Link>
            <Link href="/products?sort=newest" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              New Arrivals
            </Link>
            <Link href="/products?sort=popular" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              Best Sellers
            </Link>
            <Link href="/support" onClick={() => setMobileOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
              Help & Support
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
