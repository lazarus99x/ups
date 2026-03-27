import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, User, LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

export const Navbar: React.FC = () => {
  const { user, profile, isStaff } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <>
      {/* Top Bar */}
      <div className="bg-gray-100 text-[10px] py-1.5 px-4 border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4 text-gray-500 font-medium">
            <span className="hover:text-ups-brown cursor-pointer">Global</span>
            <span className="hover:text-ups-brown cursor-pointer">English</span>
          </div>
          <div className="flex items-center gap-4 text-gray-500 font-medium">
            <span className="hover:text-ups-brown cursor-pointer">Support</span>
            <span className="hover:text-ups-brown cursor-pointer">Locations</span>
          </div>
        </div>
      </div>

      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-12">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="w-12 h-12 bg-ups-brown rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Package className="text-ups-yellow w-7 h-7" />
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black tracking-tighter text-ups-brown leading-none">UPS</span>
                  <span className="text-[8px] font-bold text-ups-brown/60 uppercase tracking-widest">United Parcel Service</span>
                </div>
              </Link>

              <div className="hidden lg:flex items-center gap-8">
                <Link to="/" className="text-sm font-bold text-ups-brown hover:text-ups-yellow-dark transition-colors uppercase tracking-wider">Shipping</Link>
                <Link to="/" className="text-sm font-bold text-ups-brown hover:text-ups-yellow-dark transition-colors uppercase tracking-wider">Tracking</Link>
                <span className="text-sm font-bold text-ups-brown/40 cursor-not-allowed uppercase tracking-wider">Solutions</span>
                <span className="text-sm font-bold text-ups-brown/40 cursor-not-allowed uppercase tracking-wider">Support</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {user && isStaff && (
                <Link to="/admin" className="hidden sm:flex items-center gap-2 text-xs font-bold text-ups-brown bg-ups-yellow/20 px-4 py-2 rounded-xl border border-ups-yellow/30 hover:bg-ups-yellow/30 transition-all">
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              
              <div className="flex items-center gap-4">
                {user ? (
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end hidden sm:flex">
                      <span className="text-sm font-bold text-ups-brown">{profile?.displayName || user.email?.split('@')[0]}</span>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{profile?.role}</span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Logout"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};


