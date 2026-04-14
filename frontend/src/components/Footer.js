import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-[#0A0A0A] text-white py-16 mt-auto">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Shop</h4>
            <nav className="space-y-2">
              <Link to="/products" className="block text-sm text-gray-400 hover:text-white transition-colors">All Products</Link>
              <Link to="/products?sort=newest" className="block text-sm text-gray-400 hover:text-white transition-colors">New Arrivals</Link>
              <Link to="/products?sort=popular" className="block text-sm text-gray-400 hover:text-white transition-colors">Best Sellers</Link>
            </nav>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Account</h4>
            <nav className="space-y-2">
              <Link to="/account" className="block text-sm text-gray-400 hover:text-white transition-colors">My Account</Link>
              <Link to="/orders" className="block text-sm text-gray-400 hover:text-white transition-colors">Orders</Link>
              <Link to="/wishlist" className="block text-sm text-gray-400 hover:text-white transition-colors">Wishlist</Link>
            </nav>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">Support</h4>
            <nav className="space-y-2">
              <Link to="/support" className="block text-sm text-gray-400 hover:text-white transition-colors">Help Center</Link>
              <Link to="/returns" className="block text-sm text-gray-400 hover:text-white transition-colors">Returns</Link>
            </nav>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase font-bold text-gray-500 mb-4">About</h4>
            <p className="text-sm text-gray-400 leading-relaxed">
              YA Commerce is a premium e-commerce destination for quality products delivered to your doorstep.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 overflow-hidden">
          <p className="text-[12vw] md:text-[8vw] font-black tracking-tighter text-gray-800 leading-none select-none">
            YA COMMERCE
          </p>
        </div>
        <p className="text-xs text-gray-600 mt-4">&copy; {new Date().getFullYear()} YA Commerce. All rights reserved.</p>
      </div>
    </footer>
  );
}
