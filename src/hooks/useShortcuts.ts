import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Keyboard shortcuts for computers:
 *   N  → add a transaction (focuses quick add)
 *   /  → search transactions
 * Ignored while typing in a field or with Ctrl/Cmd/Alt held.
 */
export function useShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (location.pathname === '/add') document.getElementById('quick-text')?.focus();
        else navigate('/add');
      } else if (e.key === '/') {
        e.preventDefault();
        const search = document.getElementById('transaction-search');
        if (search) search.focus();
        else navigate('/transactions?focus=search');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);
}
