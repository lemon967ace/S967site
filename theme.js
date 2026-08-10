(() => {
  const STORAGE_KEY = 's967-theme';
  const VALID = new Set(['system', 'light', 'dark']);

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID.has(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    document.querySelectorAll('[data-theme-select]').forEach((select) => {
      select.value = theme;
    });
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The theme still works for the current page if storage is unavailable.
    }
  }

  function init() {
    const initial = getSavedTheme();
    applyTheme(initial);

    document.querySelectorAll('[data-theme-select]').forEach((select) => {
      select.addEventListener('change', () => {
        const theme = VALID.has(select.value) ? select.value : 'system';
        saveTheme(theme);
        applyTheme(theme);
      });
    });

    // When System is selected, CSS automatically follows OS changes.
    // This listener only keeps the control semantically in sync.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (getSavedTheme() === 'system') {
        applyTheme('system');
      }
    };

    if (media.addEventListener) {
      media.addEventListener('change', onSystemChange);
    } else if (media.addListener) {
      media.addListener(onSystemChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
