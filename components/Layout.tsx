import React, { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen w-screen bg-gray-900 text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {children}
    </div>
  );
};