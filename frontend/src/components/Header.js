import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Heart, User, Search, Menu, X, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';

export default function Header() {
  const { customer } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-black/5 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              data-testid="mobile-menu-btn"
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <Link to="/" data-testid="home-link" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                <span className="text-white font-black text-xs">YA</span>
              </div>
              <span className="text-xl font-black text-gray-900 tracking-tight hidden sm:block">YA COMMERCE</span>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-8">
            <Link to="/products" data-testid="nav-shop" className="text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black transition-colors">
              Shop
            </Link>
            <Link to="/products?sort=newest" data-testid="nav-new" className="text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black transition-colors">
              New Arrivals
            </Link>
            <Link to="/products?sort=popular" data-testid="nav-best" className="text-xs tracking-[0.15em] uppercase font-bold text-gray-500 hover:text-black transition-colors">
              Best Sellers
            </Link>
          </nav>

          <form onSubmit={handleSearch} className="hidden md:flex items-center flex-1 max-w-sm mx-8">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                data-testid="search-input"
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-black/10 transition-all"
              />
            </div>
          </form>

          <div className="flex items-center gap-1">
            {customer && (
              <Link to="/orders" data-testid="orders-link" className="p-2 text-gray-500 hover:text-black transition-colors">
                <Package size={20} />
              </Link>
            )}
            <Link to="/wishlist" data-testid="wishlist-link" className="p-2 text-gray-500 hover:text-black transition-colors">
              <Heart size={20} />
            </Link>
            <Link to="/cart" data-testid="cart-link" className="p-2 text-gray-500 hover:text-black transition-colors relative">
              <ShoppingBag size={20} />
              {itemCount > 0 && (
                <span data-testid="cart-count" className="absolute -top-0.5 -right-0.5 bg-black text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {itemCount}
                </span>
              )}
            </Link>
            <Link to={customer ? '/account' : '/auth'} data-testid="account-link" className="p-2 text-gray-500 hover:text-black transition-colors">
              <User size={20} />
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white p-4 space-y-3">
          <form onSubmit={handleSearch} className="md:hidden">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-sm text-sm" />
            </div>
          </form>
          <Link to="/products" onClick={() => setMobileOpen(false)} className="block text-sm font-semibold text-gray-700 py-2">Shop All</Link>
          <Link to="/products?sort=newest" onClick={() => setMobileOpen(false)} className="block text-sm font-semibold text-gray-700 py-2">New Arrivals</Link>
          <Link to="/products?sort=popular" onClick={() => setMobileOpen(false)} className="block text-sm font-semibold text-gray-700 py-2">Best Sellers</Link>
          {customer && <Link to="/support" onClick={() => setMobileOpen(false)} className="block text-sm font-semibold text-gray-700 py-2">Support</Link>}
        </div>
      )}
    </header>
  );
}
