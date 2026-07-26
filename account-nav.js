(() => {
  'use strict';

  const API = 'https://api.shopbgremover.com';
  const localeOrder = ['en', 'es', 'pt-br', 'zh-cn', 'de', 'fr'];
  const localeNames = {
    en: ['English', 'EN'],
    es: ['Español', 'ES'],
    'pt-br': ['Português', 'PT-BR'],
    'zh-cn': ['简体中文', '简中'],
    de: ['Deutsch', 'DE'],
    fr: ['Français', 'FR'],
  };
  const locales = {
    en: {
      html: 'en', home: '/', pricing: '/pricing', shopify: '/shopify-background-remover',
      marketplace: '/amazon-ebay-product-images', referrals: '/referrals',
      how: 'How it works', pricingText: 'Pricing', credits: 'credits', add: 'Add credits',
      signin: 'Sign in', signout: 'Sign out', language: 'Change language',
    },
    de: {
      html: 'de', home: '/de/', pricing: '/de/pricing', shopify: '/de/shopify-background-remover',
      marketplace: '/de/amazon-ebay-product-images', referrals: '/de/referrals',
      how: 'So funktioniert’s', pricingText: 'Preise', credits: 'Credits', add: 'Credits kaufen',
      signin: 'Anmelden', signout: 'Abmelden', language: 'Sprache ändern',
    },
    es: {
      html: 'es', home: '/es/', pricing: '/es/pricing', shopify: '/es/shopify-background-remover',
      marketplace: '/es/amazon-ebay-product-images', referrals: '/es/referrals',
      how: 'Cómo funciona', pricingText: 'Precios', credits: 'créditos', add: 'Comprar créditos',
      signin: 'Iniciar sesión', signout: 'Cerrar sesión', language: 'Cambiar idioma',
    },
    fr: {
      html: 'fr', home: '/fr/', pricing: '/fr/pricing', shopify: '/fr/shopify-background-remover',
      marketplace: '/fr/amazon-ebay-product-images', referrals: '/fr/referrals',
      how: 'Comment ça marche', pricingText: 'Tarifs', credits: 'crédits', add: 'Acheter des crédits',
      signin: 'Se connecter', signout: 'Se déconnecter', language: 'Changer de langue',
    },
    'pt-br': {
      html: 'pt-BR', home: '/pt-br/', pricing: '/pt-br/pricing', shopify: '/pt-br/shopify-background-remover',
      marketplace: '/pt-br/amazon-ebay-product-images', referrals: '/pt-br/referrals',
      how: 'Como funciona', pricingText: 'Preços', credits: 'créditos', add: 'Comprar créditos',
      signin: 'Entrar', signout: 'Sair', language: 'Alterar idioma',
    },
    'zh-cn': {
      html: 'zh-CN', home: '/zh-cn/', pricing: '/zh-cn/pricing', shopify: '/zh-cn/shopify-background-remover',
      marketplace: '/zh-cn/amazon-ebay-product-images', referrals: '/zh-cn/referrals',
      how: '使用方法', pricingText: '价格', credits: '积分', add: '购买积分',
      signin: '登录', signout: '退出登录', language: '切换语言',
    },
  };

  function normalizeLocale(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'pt' || normalized === 'pt-br') return 'pt-br';
    if (normalized === 'zh' || normalized === 'zh-cn') return 'zh-cn';
    return locales[normalized] ? normalized : 'en';
  }

  function currentLocale() {
    const requested = new URLSearchParams(location.search).get('lang');
    if (requested) return normalizeLocale(requested);
    return normalizeLocale(document.documentElement.lang);
  }

  function pageRoute(page, locale) {
    if (page === 'credits') return `/credits.html?lang=${locale}`;
    if (page === 'redeem') return `/redeem.html?lang=${locale}`;
    if (page === 'referrals') return locales[locale].referrals;
    return locales[locale].home;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function link(className, href, text) {
    const node = element('a', className, text);
    node.href = href;
    return node;
  }

  function renderNavigation(nav) {
    const locale = currentLocale();
    const text = locales[locale];
    const page = nav.dataset.accountPage || 'home';
    document.documentElement.lang = text.html;
    nav.replaceChildren();

    const brand = link('account-nav-brand', text.home, '');
    const logo = document.createElement('img');
    logo.src = '/Logo256.png';
    logo.alt = 'ShopBG Remover';
    brand.append(logo);
    const brandText = element('span', 'account-nav-brand-text', 'ShopBG');
    brandText.append(element('span', 'account-nav-brand-accent', 'Remover'));
    brand.append(brandText);
    nav.append(brand);

    const primary = element('div', 'account-nav-links');
    primary.append(
      link('', `${text.home}#how`, text.how),
      link('', text.pricing, text.pricingText),
      link('', text.shopify, 'Shopify'),
      link('', text.marketplace, 'Amazon & eBay'),
    );
    nav.append(primary);

    const right = element('div', 'account-nav-right');
    const credits = link('account-nav-credits', pageRoute('credits', locale), '');
    credits.id = 'accountNavCredits';
    const creditText = element('span', '', `— ${text.credits}`);
    creditText.id = 'accountNavCreditsText';
    credits.append(creditText, element('span', 'account-nav-credits-add', `＋ ${text.add}`));
    right.append(credits);

    const user = element('span', 'account-nav-user', '');
    user.id = 'accountNavUser';
    right.append(user);

    const switcher = element('div', 'account-nav-language');
    const languageButton = element('button', 'account-nav-language-button');
    languageButton.type = 'button';
    languageButton.setAttribute('aria-label', text.language);
    languageButton.setAttribute('aria-haspopup', 'true');
    languageButton.setAttribute('aria-expanded', 'false');
    languageButton.append(
      element('span', '', `🌐 ${localeNames[locale][1]}`),
      element('span', 'account-nav-language-caret', '▾'),
    );
    const languageMenu = element('ul', 'account-nav-language-menu');
    languageMenu.setAttribute('role', 'menu');
    for (const option of localeOrder) {
      const item = element('li');
      item.setAttribute('role', 'none');
      const languageLink = link(option === locale ? 'active' : '', pageRoute(page, option), localeNames[option][0]);
      languageLink.setAttribute('role', 'menuitem');
      languageLink.hreflang = locales[option].html;
      languageLink.lang = locales[option].html;
      if (option === locale) languageLink.setAttribute('aria-current', 'page');
      languageLink.append(element('span', 'account-nav-language-code', localeNames[option][1]));
      item.append(languageLink);
      languageMenu.append(item);
    }
    languageButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = languageMenu.classList.toggle('open');
      languageButton.setAttribute('aria-expanded', String(open));
    });
    switcher.append(languageButton, languageMenu);
    right.append(switcher);

    const auth = element('button', 'account-nav-auth signin', text.signin);
    auth.id = 'accountNavAuth';
    auth.type = 'button';
    auth.dataset.href = `${API}/auth/login`;
    auth.addEventListener('click', () => {
      window.location.href = auth.dataset.href;
    });
    right.append(auth);
    nav.append(right);

    document.addEventListener('click', (event) => {
      if (!switcher.contains(event.target)) {
        languageMenu.classList.remove('open');
        languageButton.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        languageMenu.classList.remove('open');
        languageButton.setAttribute('aria-expanded', 'false');
      }
    });

    fetch(`${API}/api/me`, { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (!data.user) return;
        const balance = Number(data.credits?.credits ?? 0);
        creditText.textContent = `${balance} ${text.credits}`;
        credits.classList.add('show');
        user.textContent = data.user.name || data.user.email || '';
        user.title = data.user.email || data.user.name || '';
        auth.textContent = text.signout;
        auth.classList.remove('signin');
        auth.dataset.href = `${API}/auth/logout`;
      })
      .catch(() => {});
  }

  document.querySelectorAll('[data-account-nav]').forEach(renderNavigation);
})();
