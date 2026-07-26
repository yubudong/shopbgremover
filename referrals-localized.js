(() => {
  'use strict';

  const API = 'https://api.shopbgremover.com';
  const language = document.documentElement.lang;
  const translations = {
    'zh-CN': {
      locale: 'zh-CN',
      copied: '已复制',
      copy: '复制链接',
      loadError: '无法加载推荐数据。',
      eligible: '你的推荐奖励资格已生效。',
      ineligible: '完成首次真实积分购买后，推荐奖励资格才会生效。',
      reviewPolicy: '部分卡密推荐正在人工审核；审核通过后仍需满足 7 天观察期，购买积分不受影响。',
      pendingPolicy: (time) => `推荐奖励有 7 天观察期，下一批预计于 ${time} 转为可用。`,
      defaultPolicy: '推荐奖励有 7 天观察期；观察期内发生退款、争议或拒付会取消奖励。',
      nextExpiry: (time, expired) => `最近一批可用奖励将在 ${time} 到期；未使用而过期的积分：${expired}。`,
      noExpiry: (expired) => `当前没有即将到期的可用奖励；未使用而过期的积分：${expired}。`,
      reasons: {
        referral_first_purchase: '首充推荐奖励（15%）',
        referral_repeat_purchase: '后续充值推荐奖励（10%）',
        ai_background_removal: 'AI 去背景',
        paypal_refund_referral: 'PayPal 退款冲正',
        voucher_dispute_referral: '卡密争议冲正',
      },
      rewardStatuses: { available: '可用', used: '已使用', expired: '已过期', reversed: '已冲正', reversal: '冲正流水' },
      relationshipStatuses: { bound: '已绑定', qualified: '已符合条件', rejected: '已拒绝', reversed: '已撤销' },
      riskStatuses: { normal: '正常', review: '审核中', rejected: '已拒绝' },
    },
    de: {
      locale: 'de-DE',
      copied: 'Kopiert',
      copy: 'Link kopieren',
      loadError: 'Empfehlungsdaten konnten nicht geladen werden.',
      eligible: 'Deine Berechtigung für Empfehlungsprämien ist aktiv.',
      ineligible: 'Die Berechtigung wird nach deinem ersten echten Guthabenkauf aktiviert.',
      reviewPolicy: 'Einige Kartenempfehlungen werden manuell geprüft. Nach der Freigabe gilt weiterhin die 7-tägige Beobachtungsfrist; gekauftes Guthaben ist nicht betroffen.',
      pendingPolicy: (time) => `Für Prämien gilt eine Beobachtungsfrist von 7 Tagen. Die nächste Freigabe wird am ${time} erwartet.`,
      defaultPolicy: 'Für Prämien gilt eine Beobachtungsfrist von 7 Tagen. Rückerstattungen, Konflikte oder Rückbuchungen innerhalb dieser Frist stornieren die Prämie.',
      nextExpiry: (time, expired) => `Die nächste verfügbare Prämie verfällt am ${time}; ungenutzt abgelaufen: ${expired}.`,
      noExpiry: (expired) => `Derzeit verfällt kein verfügbares Prämienguthaben; ungenutzt abgelaufen: ${expired}.`,
      reasons: {
        referral_first_purchase: 'Erstkauf-Prämie (15 %)',
        referral_repeat_purchase: 'Folgekauf-Prämie (10 %)',
        ai_background_removal: 'KI-Hintergrundentfernung',
        paypal_refund_referral: 'PayPal-Rückerstattung',
        voucher_dispute_referral: 'Karten-Streitfall',
      },
      rewardStatuses: { available: 'Verfügbar', used: 'Verwendet', expired: 'Abgelaufen', reversed: 'Storniert', reversal: 'Stornobuchung' },
      relationshipStatuses: { bound: 'Verknüpft', qualified: 'Qualifiziert', rejected: 'Abgelehnt', reversed: 'Rückgängig' },
      riskStatuses: { normal: 'Normal', review: 'In Prüfung', rejected: 'Abgelehnt' },
    },
    es: {
      locale: 'es-ES',
      copied: 'Copiado',
      copy: 'Copiar enlace',
      loadError: 'No se pudieron cargar los datos de referidos.',
      eligible: 'Tu acceso a las recompensas por referidos está activo.',
      ineligible: 'El acceso se activará después de tu primera compra real de créditos.',
      reviewPolicy: 'Algunas recomendaciones con tarjeta están en revisión manual. Tras la aprobación seguirá aplicándose el período de observación de 7 días; los créditos comprados no se ven afectados.',
      pendingPolicy: (time) => `Las recompensas tienen un período de observación de 7 días. Se espera que el próximo lote esté disponible el ${time}.`,
      defaultPolicy: 'Las recompensas tienen un período de observación de 7 días. Un reembolso, una disputa o un contracargo durante ese período cancelará la recompensa.',
      nextExpiry: (time, expired) => `La próxima recompensa disponible vence el ${time}; créditos vencidos sin usar: ${expired}.`,
      noExpiry: (expired) => `No hay recompensas disponibles próximas a vencer; créditos vencidos sin usar: ${expired}.`,
      reasons: {
        referral_first_purchase: 'Recompensa de primera compra (15 %)',
        referral_repeat_purchase: 'Recompensa de compra posterior (10 %)',
        ai_background_removal: 'Eliminación de fondo con IA',
        paypal_refund_referral: 'Reembolso de PayPal',
        voucher_dispute_referral: 'Disputa de tarjeta',
      },
      rewardStatuses: { available: 'Disponible', used: 'Usado', expired: 'Vencido', reversed: 'Revertido', reversal: 'Movimiento de reversión' },
      relationshipStatuses: { bound: 'Vinculado', qualified: 'Cualificado', rejected: 'Rechazado', reversed: 'Revertido' },
      riskStatuses: { normal: 'Normal', review: 'En revisión', rejected: 'Rechazado' },
    },
    fr: {
      locale: 'fr-FR',
      copied: 'Copié',
      copy: 'Copier le lien',
      loadError: 'Impossible de charger les données de parrainage.',
      eligible: 'Votre éligibilité aux récompenses de parrainage est active.',
      ineligible: 'L’éligibilité sera activée après votre premier achat réel de crédits.',
      reviewPolicy: 'Certains parrainages par carte sont en cours de vérification manuelle. Après approbation, la période d’observation de 7 jours s’applique toujours ; les crédits achetés ne sont pas affectés.',
      pendingPolicy: (time) => `Les récompenses sont soumises à une période d’observation de 7 jours. La prochaine mise à disposition est prévue le ${time}.`,
      defaultPolicy: 'Les récompenses sont soumises à une période d’observation de 7 jours. Tout remboursement, litige ou rejet de débit pendant cette période annule la récompense.',
      nextExpiry: (time, expired) => `La prochaine récompense disponible expire le ${time} ; crédits expirés non utilisés : ${expired}.`,
      noExpiry: (expired) => `Aucune récompense disponible n’arrive à expiration ; crédits expirés non utilisés : ${expired}.`,
      reasons: {
        referral_first_purchase: 'Récompense du premier achat (15 %)',
        referral_repeat_purchase: 'Récompense des achats suivants (10 %)',
        ai_background_removal: 'Suppression d’arrière-plan par IA',
        paypal_refund_referral: 'Remboursement PayPal',
        voucher_dispute_referral: 'Litige de carte',
      },
      rewardStatuses: { available: 'Disponible', used: 'Utilisé', expired: 'Expiré', reversed: 'Annulé', reversal: 'Écriture d’annulation' },
      relationshipStatuses: { bound: 'Lié', qualified: 'Qualifié', rejected: 'Refusé', reversed: 'Annulé' },
      riskStatuses: { normal: 'Normal', review: 'En vérification', rejected: 'Refusé' },
    },
    'pt-BR': {
      locale: 'pt-BR',
      copied: 'Copiado',
      copy: 'Copiar link',
      loadError: 'Não foi possível carregar os dados de indicações.',
      eligible: 'Sua elegibilidade para recompensas por indicação está ativa.',
      ineligible: 'A elegibilidade será ativada após sua primeira compra real de créditos.',
      reviewPolicy: 'Algumas indicações por cartão estão em análise manual. Após a aprovação, o período de observação de 7 dias ainda se aplica; os créditos comprados não são afetados.',
      pendingPolicy: (time) => `As recompensas têm um período de observação de 7 dias. A próxima liberação está prevista para ${time}.`,
      defaultPolicy: 'As recompensas têm um período de observação de 7 dias. Reembolso, disputa ou estorno durante esse período cancela a recompensa.',
      nextExpiry: (time, expired) => `A próxima recompensa disponível expira em ${time}; créditos expirados sem uso: ${expired}.`,
      noExpiry: (expired) => `Não há recompensas disponíveis próximas do vencimento; créditos expirados sem uso: ${expired}.`,
      reasons: {
        referral_first_purchase: 'Recompensa da primeira compra (15%)',
        referral_repeat_purchase: 'Recompensa das compras seguintes (10%)',
        ai_background_removal: 'Remoção de fundo com IA',
        paypal_refund_referral: 'Reembolso do PayPal',
        voucher_dispute_referral: 'Disputa de cartão',
      },
      rewardStatuses: { available: 'Disponível', used: 'Usado', expired: 'Expirado', reversed: 'Revertido', reversal: 'Lançamento de reversão' },
      relationshipStatuses: { bound: 'Vinculado', qualified: 'Qualificado', rejected: 'Rejeitado', reversed: 'Revertido' },
      riskStatuses: { normal: 'Normal', review: 'Em análise', rejected: 'Rejeitado' },
    },
  };
  const text = translations[language];
  if (!text) return;

  const byId = (id) => document.getElementById(id);
  const loading = byId('loading');
  const content = byId('content');
  const signIn = byId('signIn');
  const error = byId('error');

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

  function formatTime(value) {
    return value ? new Date(Number(value) * 1000).toLocaleString(text.locale) : '—';
  }
  function label(map, value) {
    return map[value] || value || '—';
  }
  function appendCell(row, value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
    return cell;
  }
  function renderRewardHistory(entries) {
    const rows = byId('rewardRows');
    rows.replaceChildren();
    byId('rewardTableWrap').hidden = entries.length === 0;
    byId('rewardEmpty').hidden = entries.length !== 0;
    for (const entry of entries) {
      const row = document.createElement('tr');
      appendCell(row, formatTime(entry.created_at));
      appendCell(row, `${entry.delta > 0 ? '+' : ''}${entry.delta}`, entry.delta > 0 ? 'positive' : 'negative');
      appendCell(row, label(text.reasons, entry.reason));
      appendCell(row, entry.related_email || '—');
      appendCell(row, formatTime(entry.expires_at));
      const statusCell = appendCell(row, '');
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = label(text.rewardStatuses, entry.status);
      statusCell.append(pill);
      rows.append(row);
    }
  }
  function renderInvitees(invitees) {
    const rows = byId('inviteeRows');
    rows.replaceChildren();
    byId('inviteeTableWrap').hidden = invitees.length === 0;
    byId('inviteeEmpty').hidden = invitees.length !== 0;
    for (const invitee of invitees) {
      const row = document.createElement('tr');
      appendCell(row, invitee.email || '—');
      appendCell(row, formatTime(invitee.bound_at));
      appendCell(row, formatTime(invitee.first_paid_at));
      appendCell(row, label(text.relationshipStatuses, invitee.status));
      appendCell(row, label(text.riskStatuses, invitee.risk_status));
      rows.append(row);
    }
  }

  async function loadReferralCenter() {
    try {
      const response = await fetch(`${API}/api/referrals/me`, {
        credentials: 'include',
        headers: { 'X-Device-ID': deviceId },
      });
      if (response.status === 401) {
        loading.hidden = true;
        signIn.hidden = false;
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(text.loadError);
      byId('code').textContent = data.code;
      byId('link').value = data.link;
      byId('registeredCount').textContent = data.registered_count;
      byId('paidCount').textContent = data.paid_count;
      byId('reviewCount').textContent = data.review_count;
      byId('availableRewards').textContent = data.available_reward_credits;
      byId('pendingRewards').textContent = data.pending_reward_credits;
      byId('totalRewards').textContent = data.total_reward_credits;
      byId('reversedRewards').textContent = data.reversed_reward_credits;
      byId('rewardPolicy').textContent = data.review_count > 0
        ? text.reviewPolicy
        : data.next_pending_release_at
          ? text.pendingPolicy(formatTime(data.next_pending_release_at))
          : text.defaultPolicy;
      byId('expiryStatus').textContent = data.next_reward_expiry_at
        ? text.nextExpiry(formatTime(data.next_reward_expiry_at), data.expired_reward_credits)
        : text.noExpiry(data.expired_reward_credits);
      renderRewardHistory(data.reward_history || []);
      renderInvitees(data.invitees || []);
      byId('eligibility').textContent = data.reward_eligible ? text.eligible : text.ineligible;
      loading.hidden = true;
      content.hidden = false;
    } catch {
      loading.hidden = true;
      error.textContent = text.loadError;
      error.hidden = false;
    }
  }

  byId('copyButton').addEventListener('click', async () => {
    const button = byId('copyButton');
    await navigator.clipboard.writeText(byId('link').value);
    button.textContent = text.copied;
    setTimeout(() => { button.textContent = text.copy; }, 1500);
  });

  loadReferralCenter();
})();
