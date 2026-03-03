'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const EmbedChat = dynamic(() => import('@/components/chat/EmbedChat').then(mod => mod.EmbedChat), { ssr: false });
const ChatProvider = dynamic(() => import('@/contexts').then(mod => mod.ChatProvider), { ssr: false });

export default function EmbedPage() {
  // Use undefined initial session to allow auto-loading from local storage
  return (
    <div className="h-full">
        <ChatProvider>
          <EmbedChat />
        </ChatProvider>
    </div>
  );
}
