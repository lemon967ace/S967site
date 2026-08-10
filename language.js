const S967_LANGUAGES = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  ru: "Русский",
};

const S967_LANGUAGE_STORAGE_KEY =
  "s967-language";

 const S967_TRANSLATIONS = {
  en: {
    language: "Language",

    headline:
      "Different Languages. One Server.",

    tagline:
      "Peaceful, open, and connected.",

    inquiry:
      "Inquiry",

    wkApplication:
      "WK Application",

    imageUpload:
      "Image Upload",

    viewImages:
      "View Images",

    unofficial:
      "Unofficial community site for State 967.",

    themeSystem:
      "System",

    themeLight:
      "Light",

    themeDark:
      "Dark",
  },

  ko: {
    language: "언어",

    headline:
      "서로 다른 언어, 하나의 서버.",

    tagline:
      "평화롭고, 열린, 하나로 이어진 곳.",

    inquiry:
      "열린 의견함",

    wkApplication:
      "황무지 신청",

    imageUpload:
      "이미지 업로드",

    viewImages:
      "이미지 확인",

    unofficial:
      "967 서버의 비공식 커뮤니티 사이트입니다.",

    themeSystem:
      "시스템",

    themeLight:
      "라이트",

    themeDark:
      "다크",
  },

  ja: {
    language: "言語",

    headline:
      "異なる言語、ひとつのサーバー。",

    tagline:
      "平和で、オープンで、つながる場所。",

    inquiry:
      "匿名ご意見・通報",

    wkApplication:
      "荒野申請",

    imageUpload:
      "画像アップロード",

    viewImages:
      "画像を見る",

    unofficial:
      "State 967の非公式コミュニティサイトです。",

    themeSystem:
      "システム",

    themeLight:
      "ライト",

    themeDark:
      "ダーク",
  },

  ru: {
    language: "Язык",

    headline:
      "Разные языки. Один сервер.",

    tagline:
      "Мирное, открытое и единое сообщество.",

    inquiry:
      "Открытая обратная связь",

    wkApplication:
      "Заявка на WK",

    imageUpload:
      "Загрузить изображения",

    viewImages:
      "Просмотреть изображения",

    unofficial:
      "Неофициальный сайт сообщества State 967.",

    themeSystem:
      "Системная",

    themeLight:
      "Светлая",

    themeDark:
      "Тёмная",
  },
};


function getBrowserLanguage() {
  const language =
    (
      navigator.language ||
      navigator.userLanguage ||
      "en"
    ).toLowerCase();

  if (language.startsWith("ko")) {
    return "ko";
  }

  if (language.startsWith("ja")) {
    return "ja";
  }

  if (language.startsWith("ru")) {
    return "ru";
  }

  return "en";
}


function getSavedLanguage() {
  const saved =
    localStorage.getItem(
      S967_LANGUAGE_STORAGE_KEY
    );

  if (
    saved &&
    S967_LANGUAGES[saved]
  ) {
    return saved;
  }

  return null;
}


function getCurrentLanguage() {
  return (
    getSavedLanguage() ||
    getBrowserLanguage()
  );
}


function getTranslation(
  key,
  language = getCurrentLanguage()
) {
  return (
    S967_TRANSLATIONS[language]?.[key] ??
    S967_TRANSLATIONS.en?.[key] ??
    key
  );
}


function applyLanguage(language) {
  if (!S967_LANGUAGES[language]) {
    language = "en";
  }

  document.documentElement.lang =
    language;

  document.documentElement.dataset.language =
    language;

  document
    .querySelectorAll(
      "[data-i18n]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18n;

      element.textContent =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-i18n-placeholder]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18nPlaceholder;

      element.placeholder =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-i18n-title]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18nTitle;

      element.title =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-language-choice]"
    )
    .forEach((button) => {
      const isActive =
        button.dataset.languageChoice ===
        language;

      button.setAttribute(
        "aria-checked",
        String(isActive)
      );
    });

  window.dispatchEvent(
    new CustomEvent(
      "s967languagechange",
      {
        detail: {
          language,
        },
      }
    )
  );
}


function setLanguage(language) {
  if (!S967_LANGUAGES[language]) {
    return;
  }

  localStorage.setItem(
    S967_LANGUAGE_STORAGE_KEY,
    language
  );

  applyLanguage(language);
}


function initializeLanguage() {
  applyLanguage(
    getCurrentLanguage()
  );

  const picker =
    document.querySelector(
      "[data-language-picker]"
    );

  const menuButton =
    document.querySelector(
      "[data-language-button]"
    );

  document
    .querySelectorAll(
      "[data-language-choice]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setLanguage(
            button.dataset
              .languageChoice
          );

          picker?.classList.remove(
            "is-open"
          );

          menuButton?.setAttribute(
            "aria-expanded",
            "false"
          );
        }
      );
    });

  if (picker && menuButton) {
    menuButton.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();

        const isOpen =
          picker.classList.toggle(
            "is-open"
          );

        menuButton.setAttribute(
          "aria-expanded",
          String(isOpen)
        );
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          !picker.contains(
            event.target
          )
        ) {
          picker.classList.remove(
            "is-open"
          );

          menuButton.setAttribute(
            "aria-expanded",
            "false"
          );
        }
      }
    );
  }
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeLanguage
  );
} else {
  initializeLanguage();
}
