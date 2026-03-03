
import React from 'react';
import { AuthProvider } from '@/components/auth/AuthContextRefactored';

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen bg-transparent overflow-hidden">
      <AuthProvider>
        {children}
      </AuthProvider>
    </div>
  );
}
