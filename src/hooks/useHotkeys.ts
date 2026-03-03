import { useEffect } from 'react';

interface HotkeyHandlers {
  toggleSidebar?: () => void;
  openSettings?: () => void;
  toggleTheme?: () => void;
  newChat?: () => void;
  openHelp?: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside input/textarea (unless it's a command like Ctrl+Enter which we might handle elsewhere)
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) && e.key !== 'Escape') {
          // Allow Ctrl+B etc even in inputs? Usually yes for app-level nav.
          // But typing ',' should not trigger settings if Ctrl not pressed.
          // The checks below require Ctrl, so it's safe usually.
      }

      // Toggle Sidebar: Ctrl+B / Cmd+B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handlers.toggleSidebar?.();
      }
      
      // Open Settings: Ctrl+, / Cmd+,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        handlers.openSettings?.();
      }

      // Toggle Theme: Ctrl+Shift+L / Cmd+Shift+L
       if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handlers.toggleTheme?.();
      }

      // Open Help: F1 or Ctrl+/
      if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        handlers.openHelp?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers.toggleSidebar, handlers.openSettings, handlers.toggleTheme, handlers.newChat, handlers.openHelp]);
}
