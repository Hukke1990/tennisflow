import { memo } from 'react';
import Navbar from '../components/Navbar';
import BottomNav from '../components/BottomNav';
import { Outlet } from 'react-router-dom';

function MainLayout({ children = null }) {
  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {children ?? <Outlet />}
      </main>
      <BottomNav />
    </div>
  );
}

export default memo(MainLayout);