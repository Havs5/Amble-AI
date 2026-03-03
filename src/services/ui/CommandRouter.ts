
export type AppAction = 
  | { type: 'NAVIGATE'; view: 'amble' | 'billing' | 'studio' | 'knowledge' }
  | { type: 'THEME'; mode: 'dark' | 'light' | 'toggle' }
  | { type: 'CHAT'; action: 'new' | 'clear' }
  | { type: 'STUDIO'; tab: 'image' | 'video' | 'audio' }
  | null;

export class CommandRouter {
  
  static match(text: string): AppAction {
    const t = text.toLowerCase().trim();

    // Navigation
    if (t.includes('open studio') || t.includes('go to studio')) return { type: 'NAVIGATE', view: 'studio' };
    if (t.includes('open chat') || t.includes('go to chat') || t.includes('back to chat')) return { type: 'NAVIGATE', view: 'amble' };
    if (t.includes('billing') || t.includes('usage') || t.includes('cost')) return { type: 'NAVIGATE', view: 'billing' };
    if (t.includes('knowledge') || t.includes('documents')) return { type: 'NAVIGATE', view: 'knowledge' };

    // Theme
    if (t.includes('dark mode') || t.includes('lights off')) return { type: 'THEME', mode: 'dark' };
    if (t.includes('light mode') || t.includes('lights on')) return { type: 'THEME', mode: 'light' };
    if (t.includes('toggle theme') || t.includes('change theme')) return { type: 'THEME', mode: 'toggle' };

    // Chat
    if (t.includes('new chat') || t.includes('start over') || t.includes('clear chat')) return { type: 'CHAT', action: 'new' };

    // Studio Tabs (deep linking)
    if (t.includes('video generation') || t.includes('video studio')) return { type: 'STUDIO', tab: 'video' };
    if (t.includes('image generation') || t.includes('image studio')) return { type: 'STUDIO', tab: 'image' };
    if (t.includes('audio studio') || t.includes('live studio')) return { type: 'STUDIO', tab: 'audio' };

    return null;
  }
}
