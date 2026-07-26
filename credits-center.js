(() => {
  const API = 'https://api.shopbgremover.com';
  const locales = {
    en: {
      html: 'en', date: 'en-US', home: '/', pricing: '/pricing', referrals: '/referrals',
      text: {
        eyebrow: 'Account & billing', title: 'Credit center', lead: 'Check your balance, add credits, and review every account change.',
        home: 'Back to workspace', pricing: 'Pricing', account: 'Signed in as',
        signinTitle: 'Sign in to view your credits', signinBody: 'Your balance, orders, and transaction history are private to your account.', signin: 'Sign in',
        total: 'Available credits', paid: 'Paid credits', rewards: 'Free & rewards', used: 'Total used',
        totalNote: 'Ready for AI removal', paidNote: 'Never expire', rewardsNote: 'May have expiry dates', usedNote: 'Successful AI jobs',
        paypal: 'Buy with PayPal', paypalDesc: '100, 300, or 1000 permanent credits in USD.',
        voucher: 'Redeem a voucher', voucherDesc: 'Enter a one-time code purchased through Xianyu.',
        referral: 'Referral center', referralDesc: 'View your referral code and pending rewards.',
        orders: 'Top-up orders', ordersNote: 'PayPal payments and voucher redemptions',
        transactions: 'Credit transactions', transactionsNote: 'Every credit addition and deduction',
        grants: 'Credit batches', grantsNote: 'Remaining amount and expiration for each batch',
        dateCol: 'Date', methodCol: 'Method', amountCol: 'Amount', creditsCol: 'Credits', statusCol: 'Status',
        changeCol: 'Change', typeCol: 'Type', reasonCol: 'Reason', remainingCol: 'Remaining', expiresCol: 'Expires',
        empty: 'No records yet.', never: 'Never', loadError: 'Unable to load the credit center. Please try again.',
      },
    },
    'zh-cn': {
      html: 'zh-CN', date: 'zh-CN', home: '/zh-cn/', pricing: '/zh-cn/pricing', referrals: '/zh-cn/referrals',
      text: {
        eyebrow: '账户与计费', title: '积分中心', lead: '查看余额、购买积分，并核对账户的每一笔变动。',
        home: '返回工作区', pricing: '价格', account: '当前登录账户',
        signinTitle: '登录后查看积分', signinBody: '余额、订单和交易记录仅对当前账户可见。', signin: '登录',
        total: '可用积分', paid: '付费积分', rewards: '免费与奖励积分', used: '累计使用',
        totalNote: '可用于 AI 去背景', paidNote: '永久有效', rewardsNote: '可能存在有效期', usedNote: '成功的 AI 任务',
        paypal: '使用 PayPal 购买', paypalDesc: '以美元购买 100、300 或 1000 个永久积分。',
        voucher: '兑换卡密', voucherDesc: '输入通过闲鱼购买的一次性卡密。',
        referral: '推荐中心', referralDesc: '查看推荐码和待生效奖励。',
        orders: '充值订单', ordersNote: 'PayPal 付款与卡密兑换',
        transactions: '积分流水', transactionsNote: '每一笔积分增加与扣除',
        grants: '积分批次', grantsNote: '每批积分的剩余数量和有效期',
        dateCol: '时间', methodCol: '方式', amountCol: '金额', creditsCol: '积分', statusCol: '状态',
        changeCol: '变化', typeCol: '类型', reasonCol: '原因', remainingCol: '剩余', expiresCol: '有效期',
        empty: '暂无记录。', never: '永久有效', loadError: '无法加载积分中心，请重试。',
      },
    },
    de: {
      html: 'de', date: 'de-DE', home: '/de/', pricing: '/de/pricing', referrals: '/de/referrals',
      text: {
        eyebrow: 'Konto & Abrechnung', title: 'Credit-Center', lead: 'Guthaben prüfen, Credits kaufen und alle Kontobewegungen ansehen.',
        home: 'Zurück zum Arbeitsbereich', pricing: 'Preise', account: 'Angemeldet als',
        signinTitle: 'Anmelden, um Credits zu sehen', signinBody: 'Guthaben, Bestellungen und Verlauf sind nur in deinem Konto sichtbar.', signin: 'Anmelden',
        total: 'Verfügbare Credits', paid: 'Bezahlte Credits', rewards: 'Kostenlos & Prämien', used: 'Insgesamt verbraucht',
        totalNote: 'Für KI-Freistellung', paidNote: 'Verfallen nie', rewardsNote: 'Können ablaufen', usedNote: 'Erfolgreiche KI-Aufträge',
        paypal: 'Mit PayPal kaufen', paypalDesc: '100, 300 oder 1000 dauerhafte Credits in USD.',
        voucher: 'Gutschein einlösen', voucherDesc: 'Einmalcode aus einem Xianyu-Kauf eingeben.',
        referral: 'Empfehlungscenter', referralDesc: 'Empfehlungscode und ausstehende Prämien ansehen.',
        orders: 'Aufladungen', ordersNote: 'PayPal-Zahlungen und Gutscheineinlösungen',
        transactions: 'Credit-Bewegungen', transactionsNote: 'Jede Gutschrift und Abbuchung',
        grants: 'Credit-Pakete', grantsNote: 'Restbetrag und Ablaufdatum jedes Pakets',
        dateCol: 'Datum', methodCol: 'Methode', amountCol: 'Betrag', creditsCol: 'Credits', statusCol: 'Status',
        changeCol: 'Änderung', typeCol: 'Typ', reasonCol: 'Grund', remainingCol: 'Verbleibend', expiresCol: 'Ablauf',
        empty: 'Noch keine Einträge.', never: 'Nie', loadError: 'Credit-Center konnte nicht geladen werden.',
      },
    },
    es: {
      html: 'es', date: 'es-ES', home: '/es/', pricing: '/es/pricing', referrals: '/es/referrals',
      text: {
        eyebrow: 'Cuenta y pagos', title: 'Centro de créditos', lead: 'Consulta tu saldo, compra créditos y revisa todos los movimientos.',
        home: 'Volver al área de trabajo', pricing: 'Precios', account: 'Sesión iniciada como',
        signinTitle: 'Inicia sesión para ver tus créditos', signinBody: 'Tu saldo, pedidos e historial son privados.', signin: 'Iniciar sesión',
        total: 'Créditos disponibles', paid: 'Créditos pagados', rewards: 'Gratis y recompensas', used: 'Total utilizado',
        totalNote: 'Listos para usar con IA', paidNote: 'Nunca caducan', rewardsNote: 'Pueden caducar', usedNote: 'Trabajos de IA correctos',
        paypal: 'Comprar con PayPal', paypalDesc: '100, 300 o 1000 créditos permanentes en USD.',
        voucher: 'Canjear un cupón', voucherDesc: 'Introduce un código comprado a través de Xianyu.',
        referral: 'Centro de referidos', referralDesc: 'Consulta tu código y recompensas pendientes.',
        orders: 'Recargas', ordersNote: 'Pagos PayPal y canjes de cupones',
        transactions: 'Movimientos de créditos', transactionsNote: 'Cada abono y consumo',
        grants: 'Lotes de créditos', grantsNote: 'Saldo y caducidad de cada lote',
        dateCol: 'Fecha', methodCol: 'Método', amountCol: 'Importe', creditsCol: 'Créditos', statusCol: 'Estado',
        changeCol: 'Cambio', typeCol: 'Tipo', reasonCol: 'Motivo', remainingCol: 'Restantes', expiresCol: 'Caduca',
        empty: 'Todavía no hay registros.', never: 'Nunca', loadError: 'No se pudo cargar el centro de créditos.',
      },
    },
    fr: {
      html: 'fr', date: 'fr-FR', home: '/fr/', pricing: '/fr/pricing', referrals: '/fr/referrals',
      text: {
        eyebrow: 'Compte et facturation', title: 'Centre de crédits', lead: 'Consultez votre solde, achetez des crédits et suivez chaque mouvement.',
        home: 'Retour à l’espace de travail', pricing: 'Tarifs', account: 'Connecté en tant que',
        signinTitle: 'Connectez-vous pour voir vos crédits', signinBody: 'Votre solde, vos commandes et votre historique sont privés.', signin: 'Se connecter',
        total: 'Crédits disponibles', paid: 'Crédits payés', rewards: 'Gratuits et récompenses', used: 'Total utilisé',
        totalNote: 'Prêts pour le détourage IA', paidNote: 'N’expirent jamais', rewardsNote: 'Peuvent expirer', usedNote: 'Traitements IA réussis',
        paypal: 'Acheter avec PayPal', paypalDesc: '100, 300 ou 1000 crédits permanents en USD.',
        voucher: 'Utiliser un bon', voucherDesc: 'Saisissez un code à usage unique acheté via Xianyu.',
        referral: 'Centre de parrainage', referralDesc: 'Consultez votre code et vos récompenses en attente.',
        orders: 'Rechargements', ordersNote: 'Paiements PayPal et bons utilisés',
        transactions: 'Mouvements de crédits', transactionsNote: 'Chaque ajout et chaque débit',
        grants: 'Lots de crédits', grantsNote: 'Solde et expiration de chaque lot',
        dateCol: 'Date', methodCol: 'Méthode', amountCol: 'Montant', creditsCol: 'Crédits', statusCol: 'Statut',
        changeCol: 'Variation', typeCol: 'Type', reasonCol: 'Motif', remainingCol: 'Restant', expiresCol: 'Expiration',
        empty: 'Aucun enregistrement.', never: 'Jamais', loadError: 'Impossible de charger le centre de crédits.',
      },
    },
    'pt-br': {
      html: 'pt-BR', date: 'pt-BR', home: '/pt-br/', pricing: '/pt-br/pricing', referrals: '/pt-br/referrals',
      text: {
        eyebrow: 'Conta e cobrança', title: 'Central de créditos', lead: 'Consulte seu saldo, compre créditos e veja todas as movimentações.',
        home: 'Voltar ao espaço de trabalho', pricing: 'Preços', account: 'Conectado como',
        signinTitle: 'Entre para ver seus créditos', signinBody: 'Seu saldo, pedidos e histórico são privados.', signin: 'Entrar',
        total: 'Créditos disponíveis', paid: 'Créditos pagos', rewards: 'Grátis e recompensas', used: 'Total usado',
        totalNote: 'Prontos para remoção com IA', paidNote: 'Nunca expiram', rewardsNote: 'Podem expirar', usedNote: 'Tarefas de IA concluídas',
        paypal: 'Comprar com PayPal', paypalDesc: '100, 300 ou 1000 créditos permanentes em USD.',
        voucher: 'Resgatar um voucher', voucherDesc: 'Digite um código comprado pelo Xianyu.',
        referral: 'Central de indicações', referralDesc: 'Veja seu código e recompensas pendentes.',
        orders: 'Recargas', ordersNote: 'Pagamentos PayPal e resgates de vouchers',
        transactions: 'Movimentações de créditos', transactionsNote: 'Cada crédito adicionado ou usado',
        grants: 'Lotes de créditos', grantsNote: 'Saldo e validade de cada lote',
        dateCol: 'Data', methodCol: 'Método', amountCol: 'Valor', creditsCol: 'Créditos', statusCol: 'Status',
        changeCol: 'Alteração', typeCol: 'Tipo', reasonCol: 'Motivo', remainingCol: 'Restante', expiresCol: 'Validade',
        empty: 'Nenhum registro ainda.', never: 'Nunca', loadError: 'Não foi possível carregar a central de créditos.',
      },
    },
  };

  const requested = new URLSearchParams(location.search).get('lang') || 'en';
  const locale = locales[requested] ? requested : 'en';
  const config = locales[locale];
  const t = config.text;
  document.documentElement.lang = config.html;
  document.title = `${t.title} · ShopBG Remover`;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = t[node.dataset.i18n];
    if (value) node.textContent = value;
  });
  document.getElementById('homeLink').href = config.home;
  document.getElementById('pricingLink').href = config.pricing;
  document.getElementById('paypalAction').href = `${config.pricing}#plans`;
  document.getElementById('referralAction').href = config.referrals;

  const formatDate = (value) => value
    ? new Date(Number(value) * 1000).toLocaleString(config.date, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const shortId = (value) => {
    const text = String(value || '');
    return text.length > 18 ? `${text.slice(0, 9)}…${text.slice(-6)}` : text || '—';
  };
  const typeNames = {
    paid: { en: 'Paid', 'zh-cn': '付费', de: 'Bezahlt', es: 'Pagado', fr: 'Payé', 'pt-br': 'Pago' },
    free: { en: 'Free', 'zh-cn': '免费', de: 'Kostenlos', es: 'Gratis', fr: 'Gratuit', 'pt-br': 'Grátis' },
    referral: { en: 'Referral', 'zh-cn': '推荐奖励', de: 'Empfehlung', es: 'Referido', fr: 'Parrainage', 'pt-br': 'Indicação' },
    promotion: { en: 'Promotion', 'zh-cn': '促销', de: 'Aktion', es: 'Promoción', fr: 'Promotion', 'pt-br': 'Promoção' },
    legacy: { en: 'Legacy', 'zh-cn': '历史余额', de: 'Altbestand', es: 'Anterior', fr: 'Historique', 'pt-br': 'Legado' },
  };
  const reasonNames = {
    paypal_purchase: { en: 'PayPal purchase', 'zh-cn': 'PayPal 购买', de: 'PayPal-Kauf', es: 'Compra PayPal', fr: 'Achat PayPal', 'pt-br': 'Compra PayPal' },
    voucher_redeem: { en: 'Voucher redeemed', 'zh-cn': '卡密兑换', de: 'Gutschein eingelöst', es: 'Cupón canjeado', fr: 'Bon utilisé', 'pt-br': 'Voucher resgatado' },
    ai_background_removal: { en: 'AI background removal', 'zh-cn': 'AI 去背景', de: 'KI-Hintergrundentfernung', es: 'Eliminación de fondo con IA', fr: 'Détourage IA', 'pt-br': 'Remoção de fundo com IA' },
    registration_free: { en: 'Registration credits', 'zh-cn': '注册免费积分', de: 'Registrierungs-Credits', es: 'Créditos de registro', fr: 'Crédits d’inscription', 'pt-br': 'Créditos de cadastro' },
    first_purchase_bonus: { en: 'First top-up bonus', 'zh-cn': '首充赠送', de: 'Erste Aufladeprämie', es: 'Bono de primera recarga', fr: 'Bonus de premier achat', 'pt-br': 'Bônus da primeira recarga' },
    referral_first_purchase: { en: 'First referral reward', 'zh-cn': '首充推荐奖励', de: 'Erste Empfehlungsprämie', es: 'Primera recompensa de referido', fr: 'Première récompense de parrainage', 'pt-br': 'Primeira recompensa de indicação' },
    referral_repeat_purchase: { en: 'Repeat referral reward', 'zh-cn': '后续充值推荐奖励', de: 'Weitere Empfehlungsprämie', es: 'Recompensa de referido posterior', fr: 'Récompense de parrainage suivante', 'pt-br': 'Recompensa recorrente de indicação' },
    paypal_refund: { en: 'PayPal refund', 'zh-cn': 'PayPal 退款', de: 'PayPal-Rückerstattung', es: 'Reembolso PayPal', fr: 'Remboursement PayPal', 'pt-br': 'Reembolso PayPal' },
    paypal_refund_promotion: { en: 'Bonus reversed after refund', 'zh-cn': '退款后冲正赠送积分', de: 'Bonus nach Erstattung storniert', es: 'Bono revertido tras reembolso', fr: 'Bonus annulé après remboursement', 'pt-br': 'Bônus revertido após reembolso' },
    paypal_refund_referral: { en: 'Referral reward reversed after refund', 'zh-cn': '退款后冲正推荐奖励', de: 'Empfehlungsprämie nach Erstattung storniert', es: 'Recompensa revertida tras reembolso', fr: 'Parrainage annulé après remboursement', 'pt-br': 'Indicação revertida após reembolso' },
    voucher_dispute: { en: 'Voucher dispute refund', 'zh-cn': '卡密争议退款', de: 'Gutschein-Streitfall', es: 'Reembolso por disputa del cupón', fr: 'Remboursement après litige du bon', 'pt-br': 'Reembolso por disputa do voucher' },
    voucher_dispute_promotion: { en: 'Bonus reversed after voucher dispute', 'zh-cn': '卡密争议后冲正赠送积分', de: 'Bonus nach Gutschein-Streitfall storniert', es: 'Bono revertido tras disputa', fr: 'Bonus annulé après litige', 'pt-br': 'Bônus revertido após disputa' },
    voucher_dispute_referral: { en: 'Referral reward reversed after voucher dispute', 'zh-cn': '卡密争议后冲正推荐奖励', de: 'Empfehlungsprämie nach Streitfall storniert', es: 'Recompensa revertida tras disputa', fr: 'Parrainage annulé après litige', 'pt-br': 'Indicação revertida após disputa' },
  };
  const labelFor = (map, value) => map[value]?.[locale]
    || String(value || '—').replaceAll('_', ' ');
  const cell = (row, value, className = '') => {
    const element = document.createElement('td');
    element.textContent = value;
    if (className) element.className = className;
    row.append(element);
  };
  const emptyRow = (body, columns) => {
    const row = document.createElement('tr');
    const element = document.createElement('td');
    element.colSpan = columns;
    element.className = 'cc-empty';
    element.textContent = t.empty;
    row.append(element);
    body.append(row);
  };
  const renderOrders = (orders) => {
    const body = document.getElementById('orderRows');
    body.replaceChildren();
    if (!orders.length) return emptyRow(body, 5);
    orders.forEach((order) => {
      const row = document.createElement('tr');
      cell(row, formatDate(order.completed_at || order.created_at));
      cell(row, order.payment_method === 'voucher'
        ? (locale === 'zh-cn' ? '闲鱼卡密' : 'Xianyu voucher')
        : 'PayPal');
      cell(row, `${order.currency} ${Number(order.amount || 0).toFixed(2)}`);
      cell(row, String(Number(order.base_credits || 0) + Number(order.bonus_credits || 0)));
      const orderStatus = order.refunded_at ? 'refunded' : order.status;
      const localizedOrderStatus = locale === 'zh-cn'
        ? ({ completed: '已完成', pending: '待处理', refunded: '已退款', failed: '失败' }[orderStatus] || orderStatus)
        : orderStatus;
      cell(row, localizedOrderStatus, `cc-pill ${order.status === 'completed' ? 'paid' : order.status === 'pending' ? 'pending' : 'failed'}`);
      row.title = shortId(order.id);
      body.append(row);
    });
  };
  const renderLedger = (ledger) => {
    const body = document.getElementById('ledgerRows');
    body.replaceChildren();
    if (!ledger.length) return emptyRow(body, 4);
    ledger.forEach((entry) => {
      const row = document.createElement('tr');
      cell(row, formatDate(entry.created_at));
      cell(row, `${Number(entry.delta) > 0 ? '+' : ''}${entry.delta}`, Number(entry.delta) > 0 ? 'cc-positive' : 'cc-negative');
      cell(row, labelFor(typeNames, entry.balance_type));
      cell(row, labelFor(reasonNames, entry.reason));
      body.append(row);
    });
  };
  const renderGrants = (grants) => {
    const body = document.getElementById('grantRows');
    body.replaceChildren();
    if (!grants.length) return emptyRow(body, 5);
    grants.forEach((grant) => {
      const row = document.createElement('tr');
      cell(row, formatDate(grant.created_at));
      cell(row, labelFor(typeNames, grant.credit_type));
      cell(row, String(grant.granted_credits));
      cell(row, String(grant.remaining_credits), Number(grant.remaining_credits) > 0 ? 'cc-positive' : '');
      cell(row, grant.expires_at ? formatDate(grant.expires_at) : t.never);
      body.append(row);
    });
  };

  fetch(`${API}/api/credits/center`, { credentials: 'include' })
    .then(async (response) => {
      if (response.status === 401) {
        document.getElementById('signinMessage').classList.add('show');
        return null;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.loadError);
      return data;
    })
    .then((data) => {
      if (!data) return;
      document.getElementById('creditApp').classList.add('visible');
      document.getElementById('accountText').textContent = `${t.account}: ${data.user.email}`;
      document.getElementById('totalCredits').textContent = data.credits.credits;
      document.getElementById('paidCredits').textContent = data.credits.buckets.paid;
      document.getElementById('rewardCredits').textContent =
        Number(data.credits.buckets.free || 0)
        + Number(data.credits.buckets.referral || 0)
        + Number(data.credits.buckets.promotion || 0)
        + Number(data.credits.buckets.legacy || 0);
      document.getElementById('usedCredits').textContent = data.credits.total_used;
      renderOrders(data.orders || []);
      renderLedger(data.ledger || []);
      renderGrants(data.grants || []);
    })
    .catch((error) => {
      const message = document.getElementById('loadMessage');
      message.textContent = error.message || t.loadError;
      message.classList.add('show', 'error');
    });
})();
