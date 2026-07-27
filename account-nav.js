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
      contact: '/contact', privacy: '/privacy', terms: '/terms',
      how: 'How it works', pricingText: 'Pricing', platform: 'Platform guides',
      credits: 'credits', add: 'Add credits', signin: 'Sign in', signout: 'Sign out',
      language: 'Change language', account: 'Account', creditsCenter: 'Credit center',
      referralsText: 'Referral center', redeem: 'Redeem voucher', menu: 'Open menu',
    },
    de: {
      html: 'de', home: '/de/', pricing: '/de/pricing', shopify: '/de/shopify-background-remover',
      marketplace: '/de/amazon-ebay-product-images', referrals: '/de/referrals',
      contact: '/de/contact', privacy: '/de/privacy', terms: '/de/terms',
      how: 'So funktioniert’s', pricingText: 'Preise', platform: 'Plattform-Guides',
      credits: 'Credits', add: 'Credits kaufen', signin: 'Anmelden', signout: 'Abmelden',
      language: 'Sprache ändern', account: 'Konto', creditsCenter: 'Credit-Center',
      referralsText: 'Empfehlungscenter', redeem: 'Gutschein einlösen', menu: 'Menü öffnen',
    },
    es: {
      html: 'es', home: '/es/', pricing: '/es/pricing', shopify: '/es/shopify-background-remover',
      marketplace: '/es/amazon-ebay-product-images', referrals: '/es/referrals',
      contact: '/es/contact', privacy: '/es/privacy', terms: '/es/terms',
      how: 'Cómo funciona', pricingText: 'Precios', platform: 'Guías de plataformas',
      credits: 'créditos', add: 'Comprar créditos', signin: 'Iniciar sesión', signout: 'Cerrar sesión',
      language: 'Cambiar idioma', account: 'Cuenta', creditsCenter: 'Centro de créditos',
      referralsText: 'Centro de referidos', redeem: 'Canjear cupón', menu: 'Abrir menú',
    },
    fr: {
      html: 'fr', home: '/fr/', pricing: '/fr/pricing', shopify: '/fr/shopify-background-remover',
      marketplace: '/fr/amazon-ebay-product-images', referrals: '/fr/referrals',
      contact: '/fr/contact', privacy: '/fr/privacy', terms: '/fr/terms',
      how: 'Comment ça marche', pricingText: 'Tarifs', platform: 'Guides plateformes',
      credits: 'crédits', add: 'Acheter des crédits', signin: 'Se connecter', signout: 'Se déconnecter',
      language: 'Changer de langue', account: 'Compte', creditsCenter: 'Centre de crédits',
      referralsText: 'Centre de parrainage', redeem: 'Utiliser un bon', menu: 'Ouvrir le menu',
    },
    'pt-br': {
      html: 'pt-BR', home: '/pt-br/', pricing: '/pt-br/pricing', shopify: '/pt-br/shopify-background-remover',
      marketplace: '/pt-br/amazon-ebay-product-images', referrals: '/pt-br/referrals',
      contact: '/pt-br/contact', privacy: '/pt-br/privacy', terms: '/pt-br/terms',
      how: 'Como funciona', pricingText: 'Preços', platform: 'Guias de plataformas',
      credits: 'créditos', add: 'Comprar créditos', signin: 'Entrar', signout: 'Sair',
      language: 'Alterar idioma', account: 'Conta', creditsCenter: 'Central de créditos',
      referralsText: 'Central de indicações', redeem: 'Resgatar voucher', menu: 'Abrir menu',
    },
    'zh-cn': {
      html: 'zh-CN', home: '/zh-cn/', pricing: '/zh-cn/pricing', shopify: '/zh-cn/shopify-background-remover',
      marketplace: '/zh-cn/amazon-ebay-product-images', referrals: '/zh-cn/referrals',
      contact: '/zh-cn/contact', privacy: '/zh-cn/privacy', terms: '/zh-cn/terms',
      how: '使用方法', pricingText: '价格', platform: '平台指南',
      credits: '积分', add: '购买积分', signin: '登录', signout: '退出登录',
      language: '切换语言', account: '账户', creditsCenter: '积分中心',
      referralsText: '推荐中心', redeem: '兑换卡密', menu: '打开菜单',
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

  function inferredPage() {
    const slug = location.pathname.replace(/\/+$/, '').split('/').pop() || 'home';
    const pages = {
      pricing: 'pricing',
      'shopify-background-remover': 'shopify',
      'amazon-ebay-product-images': 'marketplace',
      contact: 'contact',
      privacy: 'privacy',
      terms: 'terms',
      referrals: 'referrals',
      'credits.html': 'credits',
      'redeem.html': 'redeem',
    };
    return pages[slug] || 'home';
  }

  function pageRoute(page, locale) {
    if (page === 'credits') return `/credits.html?lang=${locale}`;
    if (page === 'redeem') return `/redeem.html?lang=${locale}`;
    if (page === 'home') return locales[locale].home;
    return locales[locale][page] || locales[locale].home;
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

  function menuItem(href, label, options = {}) {
    const item = element('li');
    item.setAttribute('role', 'none');
    const anchor = link(options.active ? 'active' : '', href, label);
    anchor.setAttribute('role', 'menuitem');
    if (options.active) anchor.setAttribute('aria-current', 'page');
    if (options.hreflang) anchor.hreflang = options.hreflang;
    if (options.lang) anchor.lang = options.lang;
    if (options.note) anchor.append(element('span', 'account-nav-menu-note', options.note));
    item.append(anchor);
    return item;
  }

  function dropdownButton(label, ariaLabel) {
    const button = element('button', 'account-nav-menu-button');
    button.type = 'button';
    button.setAttribute('aria-label', ariaLabel || label);
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.append(element('span', '', label), element('span', 'account-nav-caret', '▾'));
    return button;
  }

  function closeDropdown(button, menu) {
    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown(button, menu) {
    const open = !menu.classList.contains('open');
    document.querySelectorAll('.account-nav-menu.open').forEach((entry) => {
      if (entry !== menu) entry.classList.remove('open');
    });
    document.querySelectorAll('[aria-expanded="true"]').forEach((entry) => {
      if (entry !== button) entry.setAttribute('aria-expanded', 'false');
    });
    menu.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  }

  function renderNavigation(nav) {
    const locale = currentLocale();
    const text = locales[locale];
    const page = nav.dataset.accountPage || inferredPage();
    document.documentElement.lang = text.html;
    nav.dataset.accountPage = page;
    nav.setAttribute('aria-label', nav.getAttribute('aria-label') || text.menu);
    nav.replaceChildren();

    const inner = element('div', 'account-nav-inner');
    const brand = link('account-nav-brand', text.home, '');
    brand.setAttribute('aria-label', 'ShopBG Remover');
    const logo = document.createElement('img');
    logo.src = '/Logo256.png';
    logo.alt = '';
    brand.append(logo);
    const brandText = element('span', 'account-nav-brand-text', 'ShopBG');
    brandText.append(element('span', 'account-nav-brand-accent', 'Remover'));
    brand.append(brandText);
    inner.append(brand);

    const primary = element('div', 'account-nav-primary');
    primary.id = 'accountNavPrimary';
    const how = link('account-nav-link', `${text.home}#how`, text.how);
    const pricing = link(`account-nav-link${page === 'pricing' ? ' active' : ''}`, text.pricing, text.pricingText);
    if (page === 'pricing') pricing.setAttribute('aria-current', 'page');
    primary.append(how, pricing);

    const platform = element('div', 'account-nav-dropdown account-nav-platform');
    const platformButton = dropdownButton(text.platform, text.platform);
    if (page === 'shopify' || page === 'marketplace') platformButton.classList.add('active');
    const platformMenu = element('ul', 'account-nav-menu');
    platformMenu.setAttribute('role', 'menu');
    platformMenu.append(
      menuItem(text.shopify, 'Shopify', { active: page === 'shopify' }),
      menuItem(text.marketplace, 'Amazon & eBay', { active: page === 'marketplace' }),
    );
    platformButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleDropdown(platformButton, platformMenu);
    });
    platform.append(platformButton, platformMenu);
    primary.append(platform);
    inner.append(primary);

    const right = element('div', 'account-nav-right');
    let mobileToggle = null;
    function closeMobilePrimary() {
      primary.classList.remove('open');
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
    }
    const credits = link('account-nav-credits', pageRoute('credits', locale), '');
    credits.id = 'creditsBadge';
    credits.setAttribute('aria-label', text.creditsCenter);
    const creditText = element('span', '', `— ${text.credits}`);
    creditText.id = 'creditsText';
    credits.append(creditText, element('span', 'account-nav-credits-add', `＋ ${text.add}`));
    right.append(credits);

    const legacyUser = element('span', 'account-nav-legacy-user', '');
    legacyUser.id = 'userName';
    right.append(legacyUser);

    const language = element('div', 'account-nav-dropdown account-nav-language');
    const languageButton = element('button', 'account-nav-language-button');
    languageButton.type = 'button';
    languageButton.setAttribute('aria-label', text.language);
    languageButton.setAttribute('aria-haspopup', 'true');
    languageButton.setAttribute('aria-expanded', 'false');
    languageButton.append(
      element('span', 'account-nav-language-name', '🌐'),
      element('span', 'account-nav-language-code', localeNames[locale][1]),
      element('span', 'account-nav-caret', '▾'),
    );
    const languageMenu = element('ul', 'account-nav-menu');
    languageMenu.setAttribute('role', 'menu');
    for (const option of localeOrder) {
      languageMenu.append(menuItem(pageRoute(page, option), localeNames[option][0], {
        active: option === locale,
        hreflang: locales[option].html,
        lang: locales[option].html,
        note: localeNames[option][1],
      }));
    }
    languageButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMobilePrimary();
      toggleDropdown(languageButton, languageMenu);
    });
    language.append(languageButton, languageMenu);
    right.append(language);

    const auth = element('button', 'account-nav-auth signin', text.signin);
    auth.id = 'authBtn';
    auth.type = 'button';
    auth.addEventListener('click', () => {
      if (page === 'home' && typeof window.openLoginModal === 'function') {
        window.openLoginModal();
        return;
      }
      window.location.href = `${API}/auth/login`;
    });
    right.append(auth);

    const account = element('div', 'account-nav-dropdown account-nav-account');
    const accountButton = element('button', 'account-nav-account-button');
    accountButton.type = 'button';
    accountButton.setAttribute('aria-label', text.account);
    accountButton.setAttribute('aria-haspopup', 'true');
    accountButton.setAttribute('aria-expanded', 'false');
    accountButton.append(
      element('span', '', '●'),
      element('span', 'account-nav-account-label', text.account),
      element('span', 'account-nav-caret', '▾'),
    );
    const accountMenu = element('ul', 'account-nav-menu');
    accountMenu.setAttribute('role', 'menu');
    accountMenu.append(
      menuItem(pageRoute('credits', locale), text.creditsCenter, { active: page === 'credits' }),
      menuItem(pageRoute('referrals', locale), text.referralsText, { active: page === 'referrals' }),
      menuItem(pageRoute('redeem', locale), text.redeem, { active: page === 'redeem' }),
    );
    const signoutItem = element('li');
    signoutItem.setAttribute('role', 'none');
    const signout = element('button', '', text.signout);
    signout.type = 'button';
    signout.setAttribute('role', 'menuitem');
    signout.addEventListener('click', () => {
      window.location.href = `${API}/auth/logout`;
    });
    signoutItem.append(signout);
    accountMenu.append(signoutItem);
    accountButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMobilePrimary();
      toggleDropdown(accountButton, accountMenu);
    });
    account.append(accountButton, accountMenu);
    right.append(account);

    mobileToggle = element('button', 'account-nav-mobile-toggle');
    mobileToggle.type = 'button';
    mobileToggle.setAttribute('aria-label', text.menu);
    mobileToggle.setAttribute('aria-controls', primary.id);
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.append(element('span', 'account-nav-mobile-bars', '☰'));
    mobileToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      closeDropdown(platformButton, platformMenu);
      closeDropdown(languageButton, languageMenu);
      closeDropdown(accountButton, accountMenu);
      const open = primary.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', String(open));
    });
    right.append(mobileToggle);
    inner.append(right);
    nav.append(inner);

    function updateHowState() {
      const active = page === 'home' && location.hash === '#how';
      how.classList.toggle('active', active);
      if (active) how.setAttribute('aria-current', 'location');
      else how.removeAttribute('aria-current');
    }
    updateHowState();
    window.addEventListener('hashchange', updateHowState);

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target)) {
        closeDropdown(platformButton, platformMenu);
        closeDropdown(languageButton, languageMenu);
        closeDropdown(accountButton, accountMenu);
        closeMobilePrimary();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeDropdown(platformButton, platformMenu);
      closeDropdown(languageButton, languageMenu);
      closeDropdown(accountButton, accountMenu);
      closeMobilePrimary();
    });

    setTimeout(() => {
      fetch(`${API}/api/me`, { credentials: 'include' })
        .then((response) => response.json())
        .then((data) => {
          if (!data.user) return;
          const balance = Number(data.credits?.credits ?? 0);
          const accountName = data.user.name || data.user.email || text.account;
          creditText.textContent = `${balance} ${text.credits}`;
          credits.classList.add('show');
          legacyUser.textContent = accountName;
          accountButton.querySelector('.account-nav-account-label').textContent = accountName;
          accountButton.title = data.user.email || accountName;
          account.classList.add('show');
          auth.classList.add('session-hidden');
          auth.textContent = text.signout;
        })
        .catch(() => {});
    }, 0);
  }

  document.querySelectorAll('[data-account-nav]').forEach(renderNavigation);
})();
