/** Light / dark appearance. Stored on this device only (it's a display preference, not financial data). */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePreference = getThemePreference()) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#e3e3de');
  window.dispatchEvent(new Event('themechange'));
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked (private mode): the choice still applies until the page is closed.
  }
  applyTheme(pref);
}

/** Follow the phone/laptop setting while the preference is "system". */
export function watchSystemTheme() {
  media().addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
