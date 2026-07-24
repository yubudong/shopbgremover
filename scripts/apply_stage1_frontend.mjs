import { readFile, writeFile } from 'node:fs/promises';

const pricingLocales = {
  'pricing.html': {
    meta: 'One-time AI background removal credits for e-commerce sellers. 100 credits $3.49, 300 credits $8.99, or 1000 credits $23.99. Purchased credits never expire.',
    badge: 'One-time credits · no subscription',
    title: 'Credits that <em>never expire</em>',
    intro: 'Start with a lifetime free allowance, then buy only the credits you need. One successful AI background removal costs one credit.',
    freeName: 'Free',
    freeDesc: 'Try the full AI quality',
    freeCta: 'Start free',
    freeFeatures: [
      '3 lifetime removals without signup',
      'Up to 10 lifetime removals after signup',
      'Guest mode supports one image at a time',
      'Prior guest usage counts toward the 10',
    ],
    packNames: ['100 credits', '300 credits', '1000 credits'],
    perImage: ['$0.035 / image', '$0.030 / image', '$0.024 / image'],
    popular: 'Most popular',
    packFeatures: [
      'Purchased credits never expire',
      'Only successful AI removal costs 1 credit',
      'Local edits and exports are free',
      'Batch processing and ZIP download',
    ],
    faqTitle: 'Simple, transparent billing',
    faq: 'There are no monthly or annual plans. Purchased credits remain available permanently. Unused packs can be refunded within 7 days only when no credit from that pack has been used.',
    voucherCta: 'Bought a voucher on Xianyu? Redeem it here.',
    loginHint: 'Sign in required to complete purchase',
    createError: 'Unable to create the order. Please try again.',
    captureError: 'Payment was not completed. Please contact support if PayPal charged you.',
    paypalError: 'PayPal encountered an error. Please try again or contact support.',
    returnPath: '/',
  },
  'de/pricing.html': {
    meta: 'Einmalige KI-Credits für E-Commerce-Produktfotos: 100 Credits für $3,49, 300 für $8,99 oder 1000 für $23,99. Gekaufte Credits verfallen nie.',
    badge: 'Einmalige Credits · kein Abonnement',
    title: 'Credits, die <em>nie verfallen</em>',
    intro: 'Starte mit einem einmaligen Gratisguthaben und kaufe danach nur, was du brauchst. Eine erfolgreiche KI-Hintergrundentfernung kostet einen Credit.',
    freeName: 'Kostenlos',
    freeDesc: 'Volle KI-Qualität testen',
    freeCta: 'Kostenlos starten',
    freeFeatures: [
      '3 Entfernungen insgesamt ohne Anmeldung',
      'Bis zu 10 Entfernungen insgesamt nach Anmeldung',
      'Gastmodus: jeweils ein Bild',
      'Gastnutzung wird auf die 10 angerechnet',
    ],
    packNames: ['100 Credits', '300 Credits', '1000 Credits'],
    perImage: ['$0,035 / Bild', '$0,030 / Bild', '$0,024 / Bild'],
    popular: 'Am beliebtesten',
    packFeatures: [
      'Gekaufte Credits verfallen nie',
      'Nur erfolgreiche KI-Entfernung kostet 1 Credit',
      'Lokale Bearbeitung und Export sind kostenlos',
      'Stapelverarbeitung und ZIP-Download',
    ],
    faqTitle: 'Einfache, transparente Abrechnung',
    faq: 'Es gibt keine Monats- oder Jahrespläne. Gekaufte Credits bleiben dauerhaft verfügbar. Ungenutzte Pakete können innerhalb von 7 Tagen erstattet werden, wenn noch kein Credit aus dem Paket verwendet wurde.',
    voucherCta: 'Gutschein über Xianyu gekauft? Hier einlösen.',
    loginHint: 'Zum Kauf ist eine Anmeldung erforderlich',
    createError: 'Bestellung konnte nicht erstellt werden. Bitte versuche es erneut.',
    captureError: 'Die Zahlung wurde nicht abgeschlossen. Kontaktiere den Support, falls PayPal dich belastet hat.',
    paypalError: 'PayPal hat einen Fehler gemeldet. Bitte versuche es erneut oder kontaktiere den Support.',
    returnPath: '/de/',
  },
  'es/pricing.html': {
    meta: 'Créditos de IA de compra única para fotos de productos: 100 créditos por $3,49, 300 por $8,99 o 1000 por $23,99. Los créditos comprados no caducan.',
    badge: 'Créditos de compra única · sin suscripción',
    title: 'Créditos que <em>no caducan</em>',
    intro: 'Empieza con una cuota gratis de por vida y compra solo lo que necesites. Una eliminación de fondo con IA completada cuesta un crédito.',
    freeName: 'Gratis',
    freeDesc: 'Prueba toda la calidad de IA',
    freeCta: 'Empezar gratis',
    freeFeatures: [
      '3 eliminaciones totales sin registro',
      'Hasta 10 eliminaciones totales al registrarte',
      'Modo invitado: una imagen a la vez',
      'El uso como invitado cuenta dentro de las 10',
    ],
    packNames: ['100 créditos', '300 créditos', '1000 créditos'],
    perImage: ['$0,035 / imagen', '$0,030 / imagen', '$0,024 / imagen'],
    popular: 'Más popular',
    packFeatures: [
      'Los créditos comprados no caducan',
      'Solo una eliminación exitosa cuesta 1 crédito',
      'La edición local y la exportación son gratis',
      'Procesamiento por lotes y descarga ZIP',
    ],
    faqTitle: 'Facturación simple y transparente',
    faq: 'No hay planes mensuales ni anuales. Los créditos comprados permanecen disponibles para siempre. Los paquetes sin usar pueden reembolsarse dentro de 7 días solo si no se utilizó ningún crédito del paquete.',
    voucherCta: '¿Compraste un cupón en Xianyu? Canjéalo aquí.',
    loginHint: 'Debes iniciar sesión para completar la compra',
    createError: 'No se pudo crear el pedido. Inténtalo de nuevo.',
    captureError: 'El pago no se completó. Contacta con soporte si PayPal hizo el cargo.',
    paypalError: 'PayPal encontró un error. Inténtalo de nuevo o contacta con soporte.',
    returnPath: '/es/',
  },
  'fr/pricing.html': {
    meta: 'Crédits IA à achat unique pour photos produits : 100 crédits à $3,49, 300 à $8,99 ou 1000 à $23,99. Les crédits achetés n’expirent jamais.',
    badge: 'Crédits à achat unique · sans abonnement',
    title: 'Des crédits qui <em>n’expirent jamais</em>',
    intro: 'Commencez avec un quota gratuit à vie, puis achetez uniquement les crédits nécessaires. Une suppression d’arrière-plan IA réussie coûte un crédit.',
    freeName: 'Gratuit',
    freeDesc: 'Tester toute la qualité IA',
    freeCta: 'Commencer gratuitement',
    freeFeatures: [
      '3 suppressions au total sans inscription',
      'Jusqu’à 10 suppressions au total après inscription',
      'Mode invité : une image à la fois',
      'L’utilisation en invité compte dans les 10',
    ],
    packNames: ['100 crédits', '300 crédits', '1000 crédits'],
    perImage: ['$0,035 / image', '$0,030 / image', '$0,024 / image'],
    popular: 'Le plus populaire',
    packFeatures: [
      'Les crédits achetés n’expirent jamais',
      'Seule une suppression IA réussie coûte 1 crédit',
      'Les retouches locales et exports sont gratuits',
      'Traitement par lot et téléchargement ZIP',
    ],
    faqTitle: 'Une facturation simple et transparente',
    faq: 'Il n’existe aucun forfait mensuel ou annuel. Les crédits achetés restent disponibles définitivement. Un pack inutilisé peut être remboursé sous 7 jours uniquement si aucun de ses crédits n’a été utilisé.',
    voucherCta: 'Vous avez acheté un bon sur Xianyu ? Utilisez-le ici.',
    loginHint: 'Connexion requise pour finaliser l’achat',
    createError: 'Impossible de créer la commande. Veuillez réessayer.',
    captureError: 'Le paiement n’a pas abouti. Contactez le support si PayPal vous a débité.',
    paypalError: 'PayPal a rencontré une erreur. Veuillez réessayer ou contacter le support.',
    returnPath: '/fr/',
  },
  'pt-br/pricing.html': {
    meta: 'Créditos de IA de compra única para fotos de produtos: 100 créditos por $3,49, 300 por $8,99 ou 1000 por $23,99. Créditos comprados não expiram.',
    badge: 'Créditos de compra única · sem assinatura',
    title: 'Créditos que <em>nunca expiram</em>',
    intro: 'Comece com uma cota grátis vitalícia e compre apenas os créditos necessários. Uma remoção de fundo com IA concluída custa um crédito.',
    freeName: 'Grátis',
    freeDesc: 'Teste toda a qualidade da IA',
    freeCta: 'Começar grátis',
    freeFeatures: [
      '3 remoções no total sem cadastro',
      'Até 10 remoções no total após o cadastro',
      'Modo visitante: uma imagem por vez',
      'O uso como visitante conta dentro das 10',
    ],
    packNames: ['100 créditos', '300 créditos', '1000 créditos'],
    perImage: ['$0,035 / imagem', '$0,030 / imagem', '$0,024 / imagem'],
    popular: 'Mais popular',
    packFeatures: [
      'Créditos comprados nunca expiram',
      'Só uma remoção bem-sucedida custa 1 crédito',
      'Edição local e exportação são grátis',
      'Processamento em lote e download ZIP',
    ],
    faqTitle: 'Cobrança simples e transparente',
    faq: 'Não existem planos mensais ou anuais. Os créditos comprados ficam disponíveis para sempre. Pacotes não usados podem ser reembolsados em até 7 dias somente se nenhum crédito do pacote tiver sido usado.',
    voucherCta: 'Comprou um voucher no Xianyu? Resgate aqui.',
    loginHint: 'É necessário entrar para concluir a compra',
    createError: 'Não foi possível criar o pedido. Tente novamente.',
    captureError: 'O pagamento não foi concluído. Contate o suporte se o PayPal fez a cobrança.',
    paypalError: 'O PayPal encontrou um erro. Tente novamente ou contate o suporte.',
    returnPath: '/pt-br/',
  },
};

function featureList(items) {
  return items.map((item) => `<li><span class="ico yes">✓</span> ${item}</li>`).join('\n');
}

function renderPricing(locale) {
  const packs = [
    { credits: 100, price: '3.49', id: 'pp-100' },
    { credits: 300, price: '8.99', id: 'pp-300', featured: true },
    { credits: 1000, price: '23.99', id: 'pp-1000' },
  ];
  const packCards = packs.map((pack, index) => `
  <div class="plan${pack.featured ? ' featured' : ''}">
    ${pack.featured ? `<div class="plan-tag">${locale.popular}</div>` : ''}
    <div class="plan-name">${locale.packNames[index]}</div>
    <div class="plan-desc">${locale.packFeatures[0]}</div>
    <div class="plan-original">&nbsp;</div>
    <div class="plan-price-row">
      <span class="plan-dollar">$</span>
      <span class="plan-amount">${pack.price}</span>
      <span class="plan-period"> one-time</span>
    </div>
    <div class="plan-per">${locale.perImage[index]}</div>
    <div class="paypal-wrap" id="${pack.id}"></div>
    <div class="pp-login-hint" id="hint-${pack.credits}"></div>
    <ul class="plan-features">${featureList(locale.packFeatures)}</ul>
  </div>`).join('\n');

  return `<section class="hero">
  <div class="hero-badge">⚡ ${locale.badge}</div>
  <h1>${locale.title}</h1>
  <p>${locale.intro}</p>
</section>

<div class="plans" id="plans">
  <div class="plan">
    <div class="plan-name">${locale.freeName}</div>
    <div class="plan-desc">${locale.freeDesc}</div>
    <div class="plan-original">&nbsp;</div>
    <div class="plan-price-row"><span class="plan-dollar">$</span><span class="plan-amount">0</span></div>
    <div class="plan-per">&nbsp;</div>
    <a href="${locale.returnPath}#tool" class="plan-cta cta-ghost">${locale.freeCta}</a>
    <ul class="plan-features">${featureList(locale.freeFeatures)}</ul>
  </div>
  ${packCards}
</div>

<section class="faq">
  <div class="section-head"><h2>${locale.faqTitle}</h2></div>
  <div class="faq-item open"><div class="faq-a">${locale.faq}</div></div>
  <div class="faq-item open"><div class="faq-a"><a href="/redeem.html">${locale.voucherCta}</a></div></div>
</section>

`;
}

function renderPricingScript(locale) {
  return `const API = 'https://api.shopbgremover.com';
let currentUser = null;

async function loadUser() {
  try {
    const response = await fetch(\`\${API}/api/me\`, { credentials: 'include' });
    const data = await response.json();
    currentUser = data.user || null;
  } catch {}
  renderPayPalButtons();
}

function makeButton(containerId, plan, hintId) {
  if (!window.paypal) return;
  paypal.Buttons({
    style: { layout: 'horizontal', color: 'blue', shape: 'rect', label: 'pay', height: 44, tagline: false },
    createOrder: async () => {
      if (!currentUser) {
        window.location = \`\${API}/auth/login\`;
        return;
      }
      const response = await fetch(\`\${API}/api/paypal/create-order\`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) {
        alert(data.error || ${JSON.stringify(locale.createError)});
        return;
      }
      return data.orderId;
    },
    onApprove: async (paypalData) => {
      const response = await fetch(\`\${API}/api/paypal/capture-order\`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: paypalData.orderID }),
      });
      const result = await response.json();
      if (response.ok && result.credits != null) {
        window.location = \`${locale.returnPath}?payment=success&credits=\${result.credits}\`;
      } else {
        alert(result.error || ${JSON.stringify(locale.captureError)});
      }
    },
    onError: (error) => {
      console.error('PayPal error', error);
      alert(${JSON.stringify(locale.paypalError)});
    },
  }).render(\`#\${containerId}\`);
  const hint = document.getElementById(hintId);
  if (hint && !currentUser) hint.textContent = ${JSON.stringify(`* ${locale.loginHint}`)};
}

function renderPayPalButtons() {
  if (!window.paypal) {
    setTimeout(renderPayPalButtons, 800);
    return;
  }
  makeButton('pp-100', 'credits_100', 'hint-100');
  makeButton('pp-300', 'credits_300', 'hint-300');
  makeButton('pp-1000', 'credits_1000', 'hint-1000');
}

loadUser();`;
}

for (const [file, locale] of Object.entries(pricingLocales)) {
  let html = await readFile(file, 'utf8');
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${locale.meta}">`,
  );
  html = html.replace(
    /<section class="hero">[\s\S]*?(?=<footer class="footer">)/,
    renderPricing(locale),
  );
  html = html.replace(/currency=CNY/g, 'currency=USD');
  html = html.replace(
    /const API\s*=\s*['"]https:\/\/api\.shopbgremover\.com['"];[\s\S]*?loadUser\(\);/,
    renderPricingScript(locale),
  );
  html = html.replace(/[ \t]+$/gm, '');
  await writeFile(file, html);
}

const termSections = {
  'terms.html': `<h2>4. Credits &amp; billing</h2>
  <ul><li><strong>Free allowance:</strong> Anonymous visitors may complete 3 AI removals in total, one image at a time. Registered users receive up to 10 lifetime free removals in total, including prior guest usage. Registered free credits expire after 30 days.</li><li><strong>Purchased credits:</strong> Available only as one-time packs of 100 credits for $3.49, 300 for $8.99, or 1000 for $23.99. Purchased credits never expire.</li><li><strong>Charging:</strong> One credit is charged only after an AI background removal succeeds. Local editing, background changes, downloads, repeated exports, and ZIP creation do not cost credits.</li></ul>

  <h2>5. Payments &amp; refunds</h2>
  <p>Payments are processed by PayPal in USD. Voucher cards sold through Xianyu are paid in CNY. There are no monthly or annual subscriptions. By completing a purchase, you authorize the one-time charge shown at checkout.</p><p><strong>Refund policy:</strong> We offer refunds for an unused PayPal credit pack within 7 days only when no credit from that pack has been used. A redeemed voucher card is non-refundable. An unused voucher may be refunded by the seller only after the card is voided. Contact <a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a>. We do not offer partial refunds for partially used packs. Refunds, reversals, or chargebacks remove the credits issued by the affected purchase.</p>
`,
  'de/terms.html': `<h2>4. Credits &amp; Abrechnung</h2>
  <ul><li><strong>Kostenloses Kontingent:</strong> Gäste können insgesamt 3 KI-Entfernungen durchführen, jeweils ein Bild. Registrierte Nutzer erhalten insgesamt bis zu 10 kostenlose Entfernungen; die Gastnutzung wird angerechnet. Kostenlose Credits für registrierte Nutzer verfallen nach 30 Tagen.</li><li><strong>Gekaufte Credits:</strong> Nur als Einmalkauf: 100 Credits für $3,49, 300 für $8,99 oder 1000 für $23,99. Gekaufte Credits verfallen nie.</li><li><strong>Abrechnung:</strong> Ein Credit wird nur nach erfolgreicher KI-Hintergrundentfernung berechnet. Lokale Bearbeitung, Hintergrundwechsel, Downloads, erneute Exporte und ZIP-Erstellung sind kostenlos.</li></ul>

  <h2>5. Zahlungen &amp; Erstattungen</h2>
  <p>Zahlungen werden von PayPal in USD verarbeitet. Über Xianyu verkaufte Gutscheinkarten werden in CNY bezahlt. Es gibt keine Monats- oder Jahresabonnements. Mit dem Kauf autorisierst du die einmalige, beim Checkout angezeigte Belastung.</p><p><strong>Erstattungsrichtlinie:</strong> Ein ungenutztes PayPal-Credit-Paket kann innerhalb von 7 Tagen erstattet werden, wenn noch kein Credit daraus verwendet wurde. Eine eingelöste Gutscheinkarte ist nicht erstattungsfähig. Ein ungenutzter Gutschein kann vom Verkäufer nur erstattet werden, nachdem die Karte ungültig gemacht wurde. Kontaktiere <a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a>. Teilweise genutzte Pakete werden nicht teilweise erstattet. Erstattungen, Rückbuchungen oder Chargebacks entfernen die Credits des betroffenen Kaufs.</p>
`,
  'es/terms.html': `<h2>4. Créditos y facturación</h2>
  <ul><li><strong>Cuota gratis:</strong> Los visitantes pueden completar 3 eliminaciones con IA en total, una imagen a la vez. Los usuarios registrados reciben hasta 10 eliminaciones gratis de por vida en total, incluido el uso previo como invitado. Los créditos gratis registrados caducan después de 30 días.</li><li><strong>Créditos comprados:</strong> Solo en paquetes de compra única: 100 créditos por $3,49, 300 por $8,99 o 1000 por $23,99. Los créditos comprados no caducan.</li><li><strong>Cobro:</strong> Solo se descuenta un crédito cuando la eliminación de fondo con IA termina correctamente. La edición local, cambios de fondo, descargas, nuevas exportaciones y creación de ZIP son gratis.</li></ul>

  <h2>5. Pagos y reembolsos</h2>
  <p>PayPal procesa los pagos en USD. Las tarjetas de cupón vendidas por Xianyu se pagan en CNY. No existen suscripciones mensuales ni anuales. Al comprar, autorizas el cargo único mostrado al pagar.</p><p><strong>Política de reembolso:</strong> Reembolsamos un paquete de PayPal sin usar dentro de 7 días solo si no se utilizó ningún crédito del paquete. Un cupón canjeado no es reembolsable. El vendedor solo puede reembolsar un cupón sin usar después de anularlo. Contacta con <a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a>. No ofrecemos reembolsos parciales de paquetes parcialmente usados. Los reembolsos, reversiones o contracargos retiran los créditos emitidos por la compra afectada.</p>
`,
  'fr/terms.html': `<h2>4. Crédits et facturation</h2>
  <ul><li><strong>Quota gratuit :</strong> Les visiteurs peuvent effectuer 3 suppressions IA au total, une image à la fois. Les utilisateurs inscrits reçoivent jusqu’à 10 suppressions gratuites à vie au total, utilisation en invité comprise. Les crédits gratuits inscrits expirent après 30 jours.</li><li><strong>Crédits achetés :</strong> Uniquement en achat unique : 100 crédits à $3,49, 300 à $8,99 ou 1000 à $23,99. Les crédits achetés n’expirent jamais.</li><li><strong>Débit :</strong> Un crédit est débité uniquement après une suppression d’arrière-plan IA réussie. Retouches locales, changements de fond, téléchargements, nouveaux exports et création ZIP sont gratuits.</li></ul>

  <h2>5. Paiements et remboursements</h2>
  <p>PayPal traite les paiements en USD. Les cartes prépayées vendues via Xianyu sont payées en CNY. Il n’existe aucun abonnement mensuel ou annuel. En achetant, vous autorisez le débit unique affiché au paiement.</p><p><strong>Politique de remboursement :</strong> Un pack PayPal inutilisé peut être remboursé sous 7 jours uniquement si aucun de ses crédits n’a été utilisé. Une carte déjà utilisée n’est pas remboursable. Le vendeur ne peut rembourser une carte inutilisée qu’après l’avoir annulée. Contactez <a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a>. Aucun remboursement partiel n’est proposé pour un pack partiellement utilisé. Un remboursement, une annulation ou une rétrofacturation retire les crédits issus de l’achat concerné.</p>
`,
  'pt-br/terms.html': `<h2>4. Créditos e cobrança</h2>
  <ul><li><strong>Cota grátis:</strong> Visitantes podem concluir 3 remoções com IA no total, uma imagem por vez. Usuários cadastrados recebem até 10 remoções grátis vitalícias no total, incluindo o uso anterior como visitante. Créditos grátis cadastrados expiram após 30 dias.</li><li><strong>Créditos comprados:</strong> Somente em compra única: 100 créditos por $3,49, 300 por $8,99 ou 1000 por $23,99. Créditos comprados nunca expiram.</li><li><strong>Cobrança:</strong> Um crédito só é debitado após uma remoção de fundo com IA bem-sucedida. Edição local, troca de fundo, downloads, novas exportações e criação de ZIP são grátis.</li></ul>

  <h2>5. Pagamentos e reembolsos</h2>
  <p>Os pagamentos são processados pelo PayPal em USD. Os cartões vendidos pelo Xianyu são pagos em CNY. Não existem assinaturas mensais ou anuais. Ao comprar, você autoriza a cobrança única mostrada no checkout.</p><p><strong>Política de reembolso:</strong> Reembolsamos um pacote PayPal não usado em até 7 dias somente se nenhum crédito do pacote tiver sido utilizado. Um cartão já resgatado não é reembolsável. O vendedor só pode reembolsar um cartão não usado depois de anulá-lo. Contate <a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a>. Não oferecemos reembolso parcial de pacotes parcialmente usados. Reembolsos, reversões ou contestações removem os créditos emitidos pela compra afetada.</p>
`,
};

for (const [file, replacement] of Object.entries(termSections)) {
  let html = await readFile(file, 'utf8');
  html = html.replace(/<h2>4\.[\s\S]*?(?=<h2>6\.)/, replacement);
  html = html.replace(/March 31, 2026/g, 'July 23, 2026');
  await writeFile(file, html);
}

const indexCopy = {
  'index.html': [
    ["⚡ You're running low on credits — renew now and get 10% off.", "⚡ You're running low on credits — buy a one-time pack when you need more."],
    ['<h3>Get 20 free HD credits</h3>', '<h3>Get up to 10 lifetime free removals</h3>'],
    ["<p>You've used all your free credits. Sign up free and we'll give you <strong>20 high-resolution credits</strong> — no credit card needed.</p>", '<p>Create a free account for up to <strong>10 lifetime AI removals</strong>. Your guest usage already counts toward that total.</p>'],
    ['20 HD background removals, free', 'Up to 10 lifetime AI removals'],
    ['<p>Upgrade to Starter for just <strong>$4.9/month</strong> and get 200 credits — enough for 200 HD product images every month.</p>', '<p>Buy <strong>100 credits for $3.49</strong> when you need more. Purchased credits never expire and there is no subscription.</p>'],
    ['200 HD credits every month', '100 permanent paid credits'],
    ['Upgrade to Starter — $4.9/mo →', 'Buy 100 credits — $3.49 →'],
    ['Upgrade now →', 'Buy credits →'],
  ],
  'de/index.html': [
    ['<h3>Sichere dir 20 HD-Credits gratis</h3>', '<h3>Bis zu 10 kostenlose Entfernungen insgesamt</h3>'],
    ['<p>Du hast alle kostenlosen Credits aufgebraucht. Registriere dich kostenlos und wir schenken dir <strong>20 Credits in hoher Auflösung</strong> — keine Kreditkarte nötig.</p>', '<p>Erstelle ein kostenloses Konto für bis zu <strong>10 KI-Entfernungen insgesamt</strong>. Deine Gastnutzung wird bereits angerechnet.</p>'],
    ['20 HD-Hintergrundentfernungen, gratis', 'Bis zu 10 KI-Entfernungen insgesamt'],
    ['<p>Wechsle zu Starter für nur <strong>$4.9/Monat</strong> und erhalte 200 Credits — genug für 200 HD-Produktbilder pro Monat.</p>', '<p>Kaufe bei Bedarf <strong>100 Credits für $3,49</strong>. Gekaufte Credits verfallen nie und es gibt kein Abonnement.</p>'],
    ['200 HD-Credits jeden Monat', '100 dauerhaft gültige Credits'],
    ['Auf Starter upgraden — $4.9/Monat →', '100 Credits kaufen — $3,49 →'],
    ['Jetzt upgraden →', 'Credits kaufen →'],
  ],
  'es/index.html': [
    ['<h3>Obtén 20 créditos HD gratis</h3>', '<h3>Obtén hasta 10 eliminaciones gratis de por vida</h3>'],
    ['<p>Usaste todos tus créditos gratis. Regístrate gratis y te damos <strong>20 créditos en alta resolución</strong> — sin tarjeta de crédito.</p>', '<p>Crea una cuenta gratis para obtener hasta <strong>10 eliminaciones con IA de por vida</strong>. Tu uso como invitado ya cuenta dentro del total.</p>'],
    ['20 remociones de fondo HD, gratis', 'Hasta 10 eliminaciones con IA de por vida'],
    ['<p>Pasa a Starter por solo <strong>$4.9/mes</strong> y obtén 200 créditos — suficiente para 200 imágenes HD de productos cada mes.</p>', '<p>Compra <strong>100 créditos por $3,49</strong> cuando los necesites. Los créditos comprados no caducan y no hay suscripción.</p>'],
    ['200 créditos HD cada mes', '100 créditos pagados permanentes'],
    ['Pasar a Starter — $4.9/mes →', 'Comprar 100 créditos — $3,49 →'],
    ['Mejorar ahora →', 'Comprar créditos →'],
  ],
  'fr/index.html': [
    ['<h3>Obtenez 20 crédits HD gratuits</h3>', '<h3>Obtenez jusqu’à 10 suppressions gratuites à vie</h3>'],
    ['<p>Vous avez utilisé tous vos crédits gratuits. Inscrivez-vous gratuitement et nous vous offrons <strong>20 crédits en haute résolution</strong> — sans carte bancaire.</p>', '<p>Créez un compte gratuit pour obtenir jusqu’à <strong>10 suppressions IA à vie</strong>. Votre utilisation en invité compte déjà dans ce total.</p>'],
    ["20 suppressions d'arrière-plan HD, gratuit", 'Jusqu’à 10 suppressions IA à vie'],
    ['<p>Passez à Starter pour seulement <strong>$4.9/mois</strong> et obtenez 200 crédits — suffisant pour 200 images HD produits chaque mois.</p>', '<p>Achetez <strong>100 crédits à $3,49</strong> lorsque nécessaire. Les crédits achetés n’expirent jamais et il n’y a aucun abonnement.</p>'],
    ['200 crédits HD chaque mois', '100 crédits payants permanents'],
    ['Passer à Starter — $4.9/mois →', 'Acheter 100 crédits — $3,49 →'],
    ['Mettre à niveau →', 'Acheter des crédits →'],
  ],
  'pt-br/index.html': [
    ['<h3>Ganhe 20 créditos HD grátis</h3>', '<h3>Ganhe até 10 remoções grátis vitalícias</h3>'],
    ['<p>Você usou todos os seus créditos grátis. Cadastre-se grátis e te damos <strong>20 créditos em alta resolução</strong> — sem cartão de crédito.</p>', '<p>Crie uma conta grátis para obter até <strong>10 remoções com IA vitalícias</strong>. Seu uso como visitante já conta nesse total.</p>'],
    ['20 remoções de fundo HD, grátis', 'Até 10 remoções com IA vitalícias'],
    ['<p>Faça upgrade para o Starter por apenas <strong>$4.9/mês</strong> e ganhe 200 créditos — o suficiente para 200 imagens HD de produtos por mês.</p>', '<p>Compre <strong>100 créditos por $3,49</strong> quando precisar. Créditos comprados nunca expiram e não há assinatura.</p>'],
    ['200 créditos HD todo mês', '100 créditos pagos permanentes'],
    ['Fazer upgrade para Starter — $4.9/mês →', 'Comprar 100 créditos — $3,49 →'],
    ['Fazer upgrade agora →', 'Comprar créditos →'],
  ],
};

const deviceBootstrap = `
  function getOrCreateDeviceId() {
    let id = localStorage.getItem('sbgrDeviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('sbgrDeviceId', id);
    }
    document.cookie = \`sbgr_device=\${encodeURIComponent(id)}; Path=/; Domain=.shopbgremover.com; Max-Age=31536000; Secure; SameSite=Lax\`;
    return id;
  }
  const DEVICE_ID = getOrCreateDeviceId();
`;

for (const [file, replacements] of Object.entries(indexCopy)) {
  let html = await readFile(file, 'utf8');
  if (!html.includes('const DEVICE_ID = getOrCreateDeviceId();')) {
    html = html.replace(
      /(\s*const API\s*=\s*['"]https:\/\/api\.shopbgremover\.com['"];\s*)/,
      `$1${deviceBootstrap}`,
    );
  }
  html = html.replace(
    /headers: \{ 'Content-Type': 'application\/json' \}/g,
    "headers: { 'Content-Type': 'application/json', 'X-Device-ID': DEVICE_ID }",
  );
  html = html.replace(
    /\{ method: 'GET', credentials: 'include' \}/g,
    "{ method: 'GET', credentials: 'include', headers: { 'X-Device-ID': DEVICE_ID } }",
  );
  html = html.replace(
    /body: JSON\.stringify\(\{ image_url: dataUrl \}\)/g,
    "body: JSON.stringify({ image_url: dataUrl, task_id: crypto.randomUUID() })",
  );
  html = html.replace(
    /selectedFiles = files\.filter\(f => f\.type\.startsWith\('image\/'\)\)\.slice\(0, 50\);/g,
    "selectedFiles = files.filter(f => f.type.startsWith('image/')).slice(0, currentUser ? 50 : 1);",
  );
  html = html.replace(
    /\n\s*if \(!currentUser && getFreeCount\(\) >= 10\) \{\s*showRegisterModal\(\);\s*return;\s*\}\n/g,
    '\n',
  );
  html = html.replace(/\n\s*if \(!currentUser\) incrementFreeCount\(\);\n/g, '\n');
  html = html.replace(
    /\n\s*function getFreeCount\(\) \{[\s\S]*?function incrementFreeCount\(\) \{[\s\S]*?\n\s*\}\n/,
    '\n',
  );
  for (const [from, to] of replacements) html = html.replace(from, to);
  html = html.replace(/¥22/g, '$3.49');
  await writeFile(file, html);
}

const marketingReplacements = {
  'shopify-background-remover.html': [
    ['3 free images per day, no sign-up required', '3 free images in total, no sign-up required'],
    ['Yes — 3 free images per day, no account required.', 'Yes — 3 free images in total, no account required.'],
  ],
  'amazon-ebay-product-images.html': [
    ['3 free images per day, no sign-up required', '3 free images in total, no sign-up required'],
  ],
  'de/shopify-background-remover.html': [
    ['3 kostenlose Bilder pro Tag, ohne Anmeldung', '3 kostenlose Bilder insgesamt, ohne Anmeldung'],
    ['Ja — 3 kostenlose Bilder pro Tag, ohne Konto.', 'Ja — 3 kostenlose Bilder insgesamt, ohne Konto.'],
  ],
  'de/amazon-ebay-product-images.html': [
    ['3 kostenlose Bilder pro Tag, ohne Anmeldung', '3 kostenlose Bilder insgesamt, ohne Anmeldung'],
  ],
  'es/shopify-background-remover.html': [
    ['3 imágenes gratis al día, sin registro', '3 imágenes gratis en total, sin registro'],
    ['Sí — 3 imágenes gratis al día, sin necesidad de cuenta.', 'Sí — 3 imágenes gratis en total, sin necesidad de cuenta.'],
  ],
  'es/amazon-ebay-product-images.html': [
    ['3 imágenes gratis al día, sin registro', '3 imágenes gratis en total, sin registro'],
  ],
  'fr/shopify-background-remover.html': [
    ['3 images gratuites par jour, sans inscription', '3 images gratuites au total, sans inscription'],
    ['Oui — 3 images gratuites par jour, sans compte requis.', 'Oui — 3 images gratuites au total, sans compte requis.'],
  ],
  'fr/amazon-ebay-product-images.html': [
    ['3 images gratuites par jour, sans inscription', '3 images gratuites au total, sans inscription'],
  ],
  'pt-br/shopify-background-remover.html': [
    ['3 imagens grátis por dia, sem cadastro', '3 imagens grátis no total, sem cadastro'],
    ['Sim — 3 imagens grátis por dia, sem precisar de conta.', 'Sim — 3 imagens grátis no total, sem precisar de conta.'],
  ],
  'pt-br/amazon-ebay-product-images.html': [
    ['3 imagens grátis por dia, sem cadastro', '3 imagens grátis no total, sem cadastro'],
  ],
};

for (const [file, replacements] of Object.entries(marketingReplacements)) {
  let html = await readFile(file, 'utf8');
  for (const [from, to] of replacements) html = html.replaceAll(from, to);
  await writeFile(file, html);
}
