(() => {
  const STORAGE_KEY = 's967-theme';
  const VALID = new Set(['system', 'light', 'dark']);

  const ICONS = {
    system: '◐',
    light: '☀',
    dark: '☾'
  };

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID.has(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    document.querySelectorAll('[data-theme-button]').forEach((button) => {
      button.textContent = ICONS[theme] || ICONS.system;
      button.setAttribute('aria-label', `Theme: ${theme}`);
      button.setAttribute('title', `Theme: ${theme}`);
    });

    document.querySelectorAll('[data-theme-choice]').forEach((choice) => {
      const active = choice.dataset.themeChoice === theme;
      choice.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function closeAllMenus(except = null) {
    document.querySelectorAll('[data-theme-picker]').forEach((picker) => {
      if (picker !== except) {
        picker.classList.remove('is-open');
        const button = picker.querySelector('[data-theme-button]');
        if (button) button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initPicker(picker) {
    const button = picker.querySelector('[data-theme-button]');
    const menu = picker.querySelector('[data-theme-menu]');

    if (!button || !menu) return;

    button.addEventListener('click', (event) => {
      event.stopPropagation();

      const willOpen = !picker.classList.contains('is-open');
      closeAllMenus(picker);

      picker.classList.toggle('is-open', willOpen);
      button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    picker.querySelectorAll('[data-theme-choice]').forEach((choice) => {
      choice.addEventListener('click', () => {
        const theme = VALID.has(choice.dataset.themeChoice)
          ? choice.dataset.themeChoice
          : 'system';

        saveTheme(theme);
        applyTheme(theme);

        picker.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function init() {
    const initial = getSavedTheme();
    applyTheme(initial);

    document.querySelectorAll('[data-theme-picker]').forEach(initPicker);

    document.addEventListener('click', () => closeAllMenus());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllMenus();
    });

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
