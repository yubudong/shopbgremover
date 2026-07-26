(() => {
  'use strict';

  const API = 'https://api.shopbgremover.com';
  const locales = {
    en: {
      html: 'en', date: 'en-US', referrals: '/referrals',
      title: 'Redeem voucher · ShopBG Remover',
      description: 'Redeem a one-time ShopBG Remover credit voucher purchased through Xianyu.',
      eyebrow: 'Xianyu voucher', heading: 'Redeem voucher',
      lead: 'Sign in to the ShopBG Remover account that should receive the credits, then enter the one-time voucher purchased through Xianyu. Redeemed credits never expire.',
      checking: 'Checking sign-in status…', account: (email) => `Current account: ${email}`,
      signinPrompt: 'Sign in to ShopBG Remover before redeeming a voucher.',
      voucherLabel: 'Voucher code', referralLabel: 'Referral code (optional)',
      referralHint: 'A referral can only be linked with the first top-up and cannot be changed later. Eligible first purchases of 300 or 1000 credits receive 30 bonus credits.',
      redeem: 'Redeem now', signin: 'Sign in to redeem',
      rules: ['Each voucher can only be redeemed successfully once.', 'Credits are added to the currently signed-in account.', 'Never share the full voucher code with anyone.', 'A referral code can only be entered with the first top-up and cannot be changed later.', 'If you continue without a referral code, a referrer cannot be added later.'],
      balanceLink: 'View balance, orders, and credit history', referralLink: 'View my referral code and invitations',
      help: 'Need help? Keep your Xianyu order number and contact yubudong2023@gmail.com. Support will only verify the voucher prefix and last four characters, never the full code.',
      missingReferral: 'No referral code was entered. After a successful top-up, you cannot add a referrer or receive the referred-user first-purchase bonus. Continue?',
      processing: 'Redeeming…', fallbackError: 'Redemption failed. Please try again later.',
      already: (balance) => `This voucher is already redeemed to the current account.${balance}`,
      success: (added, balance) => `Redeemed successfully. ${added} credits were added.${balance}`,
      balance: (value) => ` Current balance: ${value}.`,
    },
    de: {
      html: 'de', date: 'de-DE', referrals: '/de/referrals',
      title: 'Guthabenkarte einlösen · ShopBG Remover',
      description: 'Löse eine einmalige ShopBG Remover Guthabenkarte von Xianyu ein.',
      eyebrow: 'Xianyu-Guthabenkarte', heading: 'Guthabenkarte einlösen',
      lead: 'Melde dich mit dem ShopBG Remover Konto an, das die Credits erhalten soll, und gib dann den einmaligen Xianyu-Code ein. Eingelöste Credits verfallen nie.',
      checking: 'Anmeldestatus wird geprüft…', account: (email) => `Aktuelles Konto: ${email}`,
      signinPrompt: 'Melde dich vor dem Einlösen bei ShopBG Remover an.',
      voucherLabel: 'Guthabencode', referralLabel: 'Empfehlungscode (optional)',
      referralHint: 'Eine Empfehlung kann nur bei der ersten Aufladung verknüpft und später nicht geändert werden. Berechtigte Erstkäufe mit 300 oder 1000 Credits erhalten 30 Bonus-Credits.',
      redeem: 'Jetzt einlösen', signin: 'Zum Einlösen anmelden',
      rules: ['Jede Guthabenkarte kann nur einmal erfolgreich eingelöst werden.', 'Die Credits werden dem aktuell angemeldeten Konto gutgeschrieben.', 'Gib den vollständigen Code niemals an andere weiter.', 'Ein Empfehlungscode kann nur bei der ersten Aufladung eingetragen und später nicht geändert werden.', 'Ohne Empfehlungscode kann später keine empfehlende Person ergänzt werden.'],
      balanceLink: 'Guthaben, Bestellungen und Verlauf ansehen', referralLink: 'Empfehlungscode und Einladungen ansehen',
      help: 'Brauchst du Hilfe? Bewahre die Xianyu-Bestellnummer auf und kontaktiere yubudong2023@gmail.com. Der Support prüft nur Präfix und letzte vier Zeichen, niemals den vollständigen Code.',
      missingReferral: 'Es wurde kein Empfehlungscode eingetragen. Nach erfolgreicher Aufladung kann keine empfehlende Person ergänzt und kein Erstkaufbonus erhalten werden. Fortfahren?',
      processing: 'Wird eingelöst…', fallbackError: 'Einlösen fehlgeschlagen. Bitte versuche es später erneut.',
      already: (balance) => `Diese Guthabenkarte wurde bereits für das aktuelle Konto eingelöst.${balance}`,
      success: (added, balance) => `Erfolgreich eingelöst. ${added} Credits wurden gutgeschrieben.${balance}`,
      balance: (value) => ` Aktuelles Guthaben: ${value}.`,
    },
    es: {
      html: 'es', date: 'es-ES', referrals: '/es/referrals',
      title: 'Canjear tarjeta · ShopBG Remover',
      description: 'Canjea una tarjeta de créditos de ShopBG Remover comprada en Xianyu.',
      eyebrow: 'Tarjeta de Xianyu', heading: 'Canjear tarjeta',
      lead: 'Inicia sesión en la cuenta de ShopBG Remover que debe recibir los créditos e introduce el código de un solo uso comprado en Xianyu. Los créditos canjeados no caducan.',
      checking: 'Comprobando la sesión…', account: (email) => `Cuenta actual: ${email}`,
      signinPrompt: 'Inicia sesión en ShopBG Remover antes de canjear una tarjeta.',
      voucherLabel: 'Código de la tarjeta', referralLabel: 'Código de referido (opcional)',
      referralHint: 'El referido solo puede vincularse en la primera recarga y no puede cambiarse después. Las primeras compras elegibles de 300 o 1000 créditos reciben 30 créditos extra.',
      redeem: 'Canjear ahora', signin: 'Iniciar sesión para canjear',
      rules: ['Cada tarjeta solo puede canjearse correctamente una vez.', 'Los créditos se añaden a la cuenta con la sesión iniciada.', 'Nunca compartas el código completo con nadie.', 'El código de referido solo puede añadirse en la primera recarga y no puede modificarse.', 'Si continúas sin código, no podrás añadir un referente después.'],
      balanceLink: 'Ver saldo, pedidos e historial', referralLink: 'Ver mi código de referido e invitaciones',
      help: '¿Necesitas ayuda? Conserva el número de pedido de Xianyu y escribe a yubudong2023@gmail.com. Soporte solo verificará el prefijo y los últimos cuatro caracteres, nunca el código completo.',
      missingReferral: 'No has introducido un código de referido. Después de la recarga no podrás añadir un referente ni recibir el bono de primera compra. ¿Continuar?',
      processing: 'Canjeando…', fallbackError: 'No se pudo canjear. Inténtalo de nuevo más tarde.',
      already: (balance) => `Esta tarjeta ya se canjeó en la cuenta actual.${balance}`,
      success: (added, balance) => `Canje correcto. Se añadieron ${added} créditos.${balance}`,
      balance: (value) => ` Saldo actual: ${value}.`,
    },
    fr: {
      html: 'fr', date: 'fr-FR', referrals: '/fr/referrals',
      title: 'Utiliser une carte · ShopBG Remover',
      description: 'Utilisez une carte de crédits ShopBG Remover achetée sur Xianyu.',
      eyebrow: 'Carte Xianyu', heading: 'Utiliser une carte',
      lead: 'Connectez-vous au compte ShopBG Remover qui doit recevoir les crédits, puis saisissez le code à usage unique acheté sur Xianyu. Les crédits ajoutés n’expirent jamais.',
      checking: 'Vérification de la connexion…', account: (email) => `Compte actuel : ${email}`,
      signinPrompt: 'Connectez-vous à ShopBG Remover avant d’utiliser une carte.',
      voucherLabel: 'Code de la carte', referralLabel: 'Code de parrainage (facultatif)',
      referralHint: 'Un parrainage ne peut être associé que lors du premier rechargement et ne peut plus être modifié. Les premiers achats éligibles de 300 ou 1000 crédits reçoivent 30 crédits bonus.',
      redeem: 'Utiliser maintenant', signin: 'Se connecter pour utiliser la carte',
      rules: ['Chaque carte ne peut être utilisée avec succès qu’une seule fois.', 'Les crédits sont ajoutés au compte actuellement connecté.', 'Ne communiquez jamais le code complet à qui que ce soit.', 'Le code de parrainage ne peut être saisi que lors du premier rechargement.', 'Sans code, aucun parrain ne pourra être ajouté ultérieurement.'],
      balanceLink: 'Voir le solde, les commandes et l’historique', referralLink: 'Voir mon code de parrainage et mes invitations',
      help: 'Besoin d’aide ? Conservez le numéro de commande Xianyu et contactez yubudong2023@gmail.com. Le support ne vérifiera que le préfixe et les quatre derniers caractères, jamais le code complet.',
      missingReferral: 'Aucun code de parrainage n’a été saisi. Après le rechargement, vous ne pourrez plus ajouter de parrain ni recevoir le bonus de premier achat. Continuer ?',
      processing: 'Utilisation en cours…', fallbackError: 'Impossible d’utiliser la carte. Réessayez plus tard.',
      already: (balance) => `Cette carte a déjà été utilisée sur le compte actuel.${balance}`,
      success: (added, balance) => `Carte utilisée. ${added} crédits ont été ajoutés.${balance}`,
      balance: (value) => ` Solde actuel : ${value}.`,
    },
    'pt-br': {
      html: 'pt-BR', date: 'pt-BR', referrals: '/pt-br/referrals',
      title: 'Resgatar cartão · ShopBG Remover',
      description: 'Resgate um cartão de créditos do ShopBG Remover comprado no Xianyu.',
      eyebrow: 'Cartão Xianyu', heading: 'Resgatar cartão',
      lead: 'Entre na conta do ShopBG Remover que deve receber os créditos e informe o código de uso único comprado no Xianyu. Os créditos resgatados nunca expiram.',
      checking: 'Verificando a sessão…', account: (email) => `Conta atual: ${email}`,
      signinPrompt: 'Entre no ShopBG Remover antes de resgatar um cartão.',
      voucherLabel: 'Código do cartão', referralLabel: 'Código de indicação (opcional)',
      referralHint: 'A indicação só pode ser vinculada na primeira recarga e não pode ser alterada depois. Primeiras compras elegíveis de 300 ou 1000 créditos recebem 30 créditos extras.',
      redeem: 'Resgatar agora', signin: 'Entrar para resgatar',
      rules: ['Cada cartão só pode ser resgatado com sucesso uma vez.', 'Os créditos são adicionados à conta conectada no momento.', 'Nunca compartilhe o código completo com ninguém.', 'O código de indicação só pode ser informado na primeira recarga.', 'Se continuar sem código, não será possível adicionar uma indicação depois.'],
      balanceLink: 'Ver saldo, pedidos e histórico', referralLink: 'Ver meu código de indicação e convites',
      help: 'Precisa de ajuda? Guarde o número do pedido do Xianyu e escreva para yubudong2023@gmail.com. O suporte só verificará o prefixo e os quatro últimos caracteres, nunca o código completo.',
      missingReferral: 'Nenhum código de indicação foi informado. Depois da recarga, não será possível adicionar uma indicação nem receber o bônus da primeira compra. Continuar?',
      processing: 'Resgatando…', fallbackError: 'Não foi possível resgatar. Tente novamente mais tarde.',
      already: (balance) => `Este cartão já foi resgatado na conta atual.${balance}`,
      success: (added, balance) => `Resgate concluído. ${added} créditos foram adicionados.${balance}`,
      balance: (value) => ` Saldo atual: ${value}.`,
    },
    'zh-cn': {
      html: 'zh-CN', date: 'zh-CN', referrals: '/zh-cn/referrals',
      title: '卡密充值 · ShopBG Remover',
      description: '登录 ShopBG Remover 后兑换通过闲鱼购买的一次性积分卡。',
      eyebrow: '闲鱼卡密', heading: '卡密充值',
      lead: '请先登录需要接收积分的 ShopBG Remover 账号，再输入通过闲鱼购买的一次性卡密。兑换后的付费积分永久有效。',
      checking: '正在检查登录状态…', account: (email) => `当前账号：${email}`,
      signinPrompt: '请先登录 ShopBG Remover，再兑换卡密。',
      voucherLabel: '卡密', referralLabel: '推荐码（选填）',
      referralHint: '推荐关系只能在首次充值时绑定，绑定后不能修改。符合条件的 300/1000 积分首充可额外获得 30 积分。',
      redeem: '立即兑换', signin: '登录后兑换',
      rules: ['一张卡密只能成功兑换一次。', '兑换成功后，积分进入当前登录账号。', '请勿把完整卡密转发给其他人。', '推荐码只能在首次充值时填写，绑定后不能修改。', '不填写推荐码继续兑换后，不能再补填推荐人。'],
      balanceLink: '查看余额、订单与积分流水', referralLink: '查看我的推荐码与邀请数据',
      help: '需要帮助？请保留闲鱼订单号，并联系 yubudong2023@gmail.com。客服只会核对卡密前缀和末四位，不会要求你公开发送完整卡密。',
      missingReferral: '本次未填写推荐码。充值成功后将不能再补填推荐人，也不会获得被推荐用户首充奖励。是否继续？',
      processing: '正在兑换…', fallbackError: '兑换失败，请稍后重试。',
      already: (balance) => `这张卡已兑换到当前账号。${balance}`,
      success: (added, balance) => `兑换成功，已到账 ${added} 积分。${balance}`,
      balance: (value) => ` 当前总余额：${value}。`,
    },
  };

  function normalizeLocale(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'pt' || normalized === 'pt-br') return 'pt-br';
    if (normalized === 'zh' || normalized === 'zh-cn') return 'zh-cn';
    return locales[normalized] ? normalized : 'en';
  }

  const locale = normalizeLocale(new URLSearchParams(location.search).get('lang'));
  const text = locales[locale];
  const byId = (id) => document.getElementById(id);
  document.documentElement.lang = text.html;
  document.title = text.title;
  document.querySelector('meta[name="description"]').content = text.description;
  byId('eyebrow').textContent = text.eyebrow;
  byId('heading').textContent = text.heading;
  byId('lead').textContent = text.lead;
  byId('accountText').textContent = text.checking;
  byId('voucherLabel').textContent = text.voucherLabel;
  byId('referralLabel').textContent = text.referralLabel;
  byId('referralHint').textContent = text.referralHint;
  byId('redeemButton').textContent = text.redeem;
  byId('signInButton').textContent = text.signin;
  byId('creditCenterLink').textContent = text.balanceLink;
  byId('creditCenterLink').href = `/credits.html?lang=${locale}`;
  byId('referralCenterLink').textContent = text.referralLink;
  byId('referralCenterLink').href = text.referrals;
  byId('helpText').textContent = text.help;
  for (const rule of text.rules) {
    const item = document.createElement('li');
    item.textContent = rule;
    byId('rules').append(item);
  }

  const accountText = byId('accountText');
  const form = byId('redeemForm');
  const signInButton = byId('signInButton');
  const button = byId('redeemButton');
  const message = byId('message');

  function getOrCreateDeviceId() {
    let id = localStorage.getItem('sbgrDeviceId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('sbgrDeviceId', id);
    }
    document.cookie = `sbgr_device=${encodeURIComponent(id)}; Path=/; Domain=.shopbgremover.com; Max-Age=31536000; Secure; SameSite=Lax`;
    return id;
  }
  const deviceId = getOrCreateDeviceId();

  function showMessage(value, type) {
    message.textContent = value;
    message.className = `message show ${type}`;
  }

  async function loadUser() {
    try {
      const response = await fetch(`${API}/api/me`, {
        credentials: 'include',
        headers: { 'X-Device-ID': deviceId },
      });
      const data = await response.json();
      if (data.user) {
        accountText.textContent = text.account(data.user.email);
        form.hidden = false;
        return;
      }
    } catch {}
    accountText.textContent = text.signinPrompt;
    signInButton.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.className = 'message';
    const referralCode = byId('referralCode').value.trim();
    if (!referralCode && !window.confirm(text.missingReferral)) return;
    button.disabled = true;
    button.textContent = text.processing;
    try {
      const response = await fetch(`${API}/api/vouchers/redeem`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
        },
        body: JSON.stringify({
          code: byId('voucherCode').value,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || text.fallbackError);
      const balance = data.balance?.credits == null ? '' : text.balance(data.balance.credits);
      showMessage(
        data.already_redeemed
          ? text.already(balance)
          : text.success(data.credits_added, balance),
        'success',
      );
      byId('voucherCode').value = '';
      byId('referralCode').value = '';
    } catch (error) {
      showMessage(error.message || text.fallbackError, 'error');
    } finally {
      button.disabled = false;
      button.textContent = text.redeem;
    }
  });

  loadUser();
})();
