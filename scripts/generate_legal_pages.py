#!/usr/bin/env python3
"""生成 11 个法务页翻译文件（es/contact 已手写，跳过）+ sitemap.xml + _routes.json
每次跑都是幂等的（覆盖现有文件）。"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://www.shopbgremover.com"

# ─── 语种配置 ───
# code, og_locale, label_full, label_short, change_lang_aria, sign_in_text, credits_word
LANGS = [
    ("en",    "en",    "English",   "EN",    "Change language",   "Sign in",        "credits"),
    ("es",    "es_MX", "Español",   "ES",    "Cambiar idioma",    "Iniciar sesión", "créditos"),
    ("pt-BR", "pt_BR", "Português", "PT-BR", "Mudar idioma",      "Entrar",         "créditos"),
    ("de",    "de_DE", "Deutsch",   "DE",    "Sprache ändern",    "Anmelden",       "Credits"),
    ("fr",    "fr_FR", "Français",  "FR",    "Changer de langue", "Se connecter",   "crédits"),
]

# url prefix per lang code
PREFIX = {"en": "", "es": "/es", "pt-BR": "/pt-br", "de": "/de", "fr": "/fr"}

# ─── 每个语种的 nav/footer link 文案 ───
NAV = {
    "es":    {"how": "Cómo funciona", "pricing": "Precios", "shopify": "Shopify", "amazon": "Amazon e eBay"},
    "pt-BR": {"how": "Como funciona", "pricing": "Preços",  "shopify": "Shopify", "amazon": "Amazon e eBay"},
    "de":    {"how": "So funktioniert's", "pricing": "Preise", "shopify": "Shopify", "amazon": "Amazon &amp; eBay"},
    "fr":    {"how": "Comment ça marche", "pricing": "Tarifs", "shopify": "Shopify", "amazon": "Amazon et eBay"},
}
FOOTER = {
    "es":    {"pricing": "Precios", "shopify": "Guía Shopify", "amazon": "Guía Amazon e eBay", "contact": "Contacto", "privacy": "Política de privacidad", "terms": "Términos de servicio", "copy": "© 2026 ShopBG Remover. Hecho para vendedores de e-commerce en todo el mundo."},
    "pt-BR": {"pricing": "Preços", "shopify": "Guia Shopify", "amazon": "Guia Amazon e eBay", "contact": "Contato", "privacy": "Política de privacidade", "terms": "Termos de serviço", "copy": "© 2026 ShopBG Remover. Feito para vendedores de e-commerce em todo o mundo."},
    "de":    {"pricing": "Preise", "shopify": "Shopify-Leitfaden", "amazon": "Amazon &amp; eBay Leitfaden", "contact": "Kontakt", "privacy": "Datenschutz", "terms": "AGB", "copy": "© 2026 ShopBG Remover. Entwickelt für E-Commerce-Verkäufer weltweit."},
    "fr":    {"pricing": "Tarifs", "shopify": "Guide Shopify", "amazon": "Guide Amazon et eBay", "contact": "Contact", "privacy": "Politique de confidentialité", "terms": "Conditions d'utilisation", "copy": "© 2026 ShopBG Remover. Conçu pour les vendeurs e-commerce du monde entier."},
}

# ─── contact 页文案 ───
CONTACT = {
    "es": {"title": "Contacto", "desc": "Contacta al equipo de ShopBG Remover. Respondemos en 1–2 días hábiles a preguntas sobre créditos, pagos o soporte.", "h1": "Ponte en contacto", "subtitle": "¿Tienes una duda sobre tus créditos, un problema de pago, o solo quieres saludar? Estamos aquí para ayudarte.", "card_title": "Soporte por correo", "email_label": "Escríbenos a", "btn": "Enviar correo", "mail_subject": "Soporte ShopBG Remover", "response": "Solemos responder en 1–2 días hábiles.", "faq_title": "💡 Revisa primero las FAQ de precios", "faq_body": "Respuestas a preguntas comunes sobre créditos, reembolsos y planes están en la <a href=\"{pricing_url}\">página de Precios</a> — podrías encontrar tu respuesta más rápido allí."},
    "pt-BR": {"title": "Contato", "desc": "Entre em contato com a equipe do ShopBG Remover. Respondemos em 1–2 dias úteis sobre créditos, pagamentos ou suporte.", "h1": "Fale conosco", "subtitle": "Tem uma dúvida sobre seus créditos, um problema de pagamento ou só quer dar oi? Estamos aqui para ajudar.", "card_title": "Suporte por e-mail", "email_label": "Mande um e-mail para", "btn": "Enviar e-mail", "mail_subject": "Suporte ShopBG Remover", "response": "Normalmente respondemos em 1–2 dias úteis.", "faq_title": "💡 Confira primeiro o FAQ de preços", "faq_body": "Respostas a perguntas comuns sobre créditos, reembolsos e planos estão na <a href=\"{pricing_url}\">página de Preços</a> — você pode encontrar sua resposta mais rápido lá."},
    "de": {"title": "Kontakt", "desc": "Kontaktiere das ShopBG Remover Team. Wir antworten innerhalb von 1–2 Werktagen auf Fragen zu Credits, Zahlungen oder Support.", "h1": "Kontakt aufnehmen", "subtitle": "Hast du eine Frage zu deinen Credits, ein Zahlungsproblem oder möchtest einfach Hallo sagen? Wir sind für dich da.", "card_title": "E-Mail-Support", "email_label": "Schreib uns an", "btn": "E-Mail senden", "mail_subject": "ShopBG Remover Support", "response": "Wir antworten in der Regel innerhalb von 1–2 Werktagen.", "faq_title": "💡 Schau zuerst in die Preis-FAQ", "faq_body": "Antworten auf häufige Fragen zu Credits, Erstattungen und Plänen findest du auf der <a href=\"{pricing_url}\">Preisseite</a> — dort findest du deine Antwort vielleicht schneller."},
    "fr": {"title": "Contact", "desc": "Contactez l'équipe ShopBG Remover. Nous répondons sous 1–2 jours ouvrés aux questions sur les crédits, paiements ou support.", "h1": "Contactez-nous", "subtitle": "Une question sur vos crédits, un problème de paiement, ou juste envie de dire bonjour ? Nous sommes là pour vous aider.", "card_title": "Support par e-mail", "email_label": "Envoyez-nous un e-mail à", "btn": "Envoyer un e-mail", "mail_subject": "Support ShopBG Remover", "response": "Nous répondons généralement sous 1–2 jours ouvrés.", "faq_title": "💡 Consultez d'abord les FAQ tarifs", "faq_body": "Les réponses aux questions courantes sur les crédits, remboursements et plans sont sur la <a href=\"{pricing_url}\">page Tarifs</a> — vous y trouverez peut-être votre réponse plus rapidement."},
}

# ─── privacy 页文案（11 sections）───
PRIVACY = {
    "es": {"title": "Política de privacidad", "desc": "Política de privacidad de ShopBG Remover. Recopilamos solo lo necesario, no vendemos tus datos y tus imágenes no se almacenan tras el procesamiento.", "tag": "Legal", "h1": "Política de privacidad", "meta_date": "Última actualización: 31 de marzo de 2026 &nbsp;·&nbsp; ShopBG Remover (operado por shopbgremover)", "highlight": "Lo mantenemos simple: recopilamos solo lo necesario para operar el servicio, no vendemos tus datos, y tus imágenes de productos nunca se almacenan después de completar el procesamiento.", "sections": [("1. Quiénes somos", "ShopBG Remover es una herramienta de remoción de fondo con IA para vendedores de e-commerce, operada bajo la marca <strong>shopbgremover</strong>. Puedes contactarnos en <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("2. Información que recopilamos", "<p>Recopilamos la mínima información necesaria para proveer el servicio:</p><ul><li><strong>Información de cuenta:</strong> Tu correo y nombre de usuario al iniciar sesión vía Google OAuth o código por correo.</li><li><strong>Datos de uso:</strong> Número de imágenes procesadas, marcas de tiempo y saldo de créditos — para gestionar tu cuenta y aplicar límites de plan.</li><li><strong>Información de pago:</strong> ID de orden, plan comprado y monto del pago. <em>No</em> almacenamos tu número de tarjeta ni credenciales completas de PayPal — los pagos los gestiona PayPal completamente.</li><li><strong>Datos técnicos:</strong> Tipo de navegador, dirección IP y registros de acceso recopilados automáticamente por Cloudflare para seguridad y rendimiento.</li></ul>"), ("3. Tus imágenes", "Tus imágenes de productos se envían a nuestra API de procesamiento IA únicamente para remoción de fondo. <strong>Las imágenes no se almacenan en nuestros servidores tras completar el procesamiento.</strong> Los resultados procesados se devuelven directamente a tu navegador y nunca se retienen ni se usan para ningún otro propósito."), ("4. Cómo usamos tu información", "<ul><li>Para autenticarte y gestionar tu cuenta</li><li>Para rastrear el uso de créditos y procesar pagos</li><li>Para enviar códigos de verificación por correo (usando Resend)</li><li>Para responder consultas de soporte</li><li>Para detectar y prevenir abusos</li></ul><p>No usamos tus datos para publicidad, y no los vendemos ni compartimos con terceros con fines de marketing.</p>"), ("5. Servicios de terceros", "<p>Usamos los siguientes servicios de terceros para operar ShopBG Remover:</p><ul><li><strong>Cloudflare</strong> — hosting, CDN, DNS y protección DDoS</li><li><strong>Google OAuth</strong> — método opcional de inicio de sesión; regido por la Política de Privacidad de Google</li><li><strong>PayPal</strong> — procesamiento de pagos; regido por la Política de Privacidad de PayPal</li><li><strong>Resend</strong> — entrega de correos transaccionales (códigos OTP)</li></ul>"), ("6. Cookies y almacenamiento local", "Usamos una cookie de sesión (<code>session</code>) para mantenerte conectado. Se establece en <code>.shopbgremover.com</code> y caduca en 30 días. También usamos <code>localStorage</code> del navegador para rastrear límites de uso gratuito para usuarios anónimos. No usamos cookies publicitarias de terceros."), ("7. Retención de datos", "Retenemos tu cuenta y registros de uso mientras tu cuenta esté activa. Puedes solicitar la eliminación de tu cuenta y datos asociados en cualquier momento escribiendo a <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Procesaremos las solicitudes de eliminación en 30 días."), ("8. Tus derechos", "Según tu ubicación, puedes tener derechos bajo GDPR, CCPA u otras leyes aplicables, incluyendo el derecho a acceder, corregir o eliminar tus datos personales. Para ejercer estos derechos, contáctanos en <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("9. Privacidad de menores", "ShopBG Remover no está dirigido a menores de 13 años. No recopilamos conscientemente información personal de menores."), ("10. Cambios en esta política", "Podemos actualizar esta política ocasionalmente. La fecha de \"Última actualización\" al inicio de esta página reflejará cualquier cambio. El uso continuado del servicio tras los cambios constituye aceptación de la política actualizada."), ("11. Contacto", "Para preguntas o solicitudes relacionadas con privacidad, escríbenos a <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "pt-BR": {"title": "Política de privacidade", "desc": "Política de privacidade do ShopBG Remover. Coletamos só o necessário, não vendemos seus dados e suas imagens não são armazenadas após o processamento.", "tag": "Legal", "h1": "Política de privacidade", "meta_date": "Última atualização: 31 de março de 2026 &nbsp;·&nbsp; ShopBG Remover (operado por shopbgremover)", "highlight": "Mantemos simples: coletamos só o necessário para operar o serviço, não vendemos seus dados, e suas imagens de produtos nunca são armazenadas após o processamento.", "sections": [("1. Quem somos", "ShopBG Remover é uma ferramenta de remoção de fundo com IA para vendedores de e-commerce, operada sob a marca <strong>shopbgremover</strong>. Você pode entrar em contato em <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("2. Informações que coletamos", "<p>Coletamos o mínimo de informação necessária para fornecer o serviço:</p><ul><li><strong>Informações de conta:</strong> Seu e-mail e nome de usuário ao entrar via Google OAuth ou código por e-mail.</li><li><strong>Dados de uso:</strong> Número de imagens processadas, timestamps e saldo de créditos — para gerenciar sua conta e aplicar limites de plano.</li><li><strong>Informações de pagamento:</strong> ID do pedido, plano comprado e valor do pagamento. <em>Não</em> armazenamos seu número de cartão ou credenciais completas do PayPal — pagamentos são tratados totalmente pelo PayPal.</li><li><strong>Dados técnicos:</strong> Tipo de navegador, endereço IP e logs de acesso coletados automaticamente pela Cloudflare para segurança e desempenho.</li></ul>"), ("3. Suas imagens", "Suas imagens de produtos são enviadas para nossa API de processamento de IA apenas para remoção de fundo. <strong>As imagens não são armazenadas em nossos servidores após o processamento.</strong> Os resultados processados são retornados direto para seu navegador e nunca são retidos ou usados para outro propósito."), ("4. Como usamos suas informações", "<ul><li>Para autenticá-lo e gerenciar sua conta</li><li>Para rastrear uso de créditos e processar pagamentos</li><li>Para enviar códigos de verificação por e-mail (usando Resend)</li><li>Para responder a consultas de suporte</li><li>Para detectar e prevenir abusos</li></ul><p>Não usamos seus dados para publicidade e não os vendemos ou compartilhamos com terceiros para marketing.</p>"), ("5. Serviços de terceiros", "<p>Usamos os seguintes serviços de terceiros para operar o ShopBG Remover:</p><ul><li><strong>Cloudflare</strong> — hospedagem, CDN, DNS e proteção DDoS</li><li><strong>Google OAuth</strong> — método opcional de login; regido pela Política de Privacidade do Google</li><li><strong>PayPal</strong> — processamento de pagamentos; regido pela Política de Privacidade do PayPal</li><li><strong>Resend</strong> — envio de e-mails transacionais (códigos OTP)</li></ul>"), ("6. Cookies e armazenamento local", "Usamos um cookie de sessão (<code>session</code>) para manter você logado. É definido em <code>.shopbgremover.com</code> e expira em 30 dias. Também usamos <code>localStorage</code> do navegador para rastrear limites de uso grátis para usuários anônimos. Não usamos cookies de publicidade de terceiros."), ("7. Retenção de dados", "Retemos sua conta e registros de uso enquanto sua conta estiver ativa. Você pode solicitar a exclusão de sua conta e dados associados a qualquer momento enviando um e-mail para <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Processaremos solicitações de exclusão em 30 dias."), ("8. Seus direitos", "Dependendo da sua localização, você pode ter direitos sob GDPR, CCPA, LGPD ou outras leis aplicáveis, incluindo o direito de acessar, corrigir ou excluir seus dados pessoais. Para exercer esses direitos, contate-nos em <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("9. Privacidade infantil", "O ShopBG Remover não é direcionado a menores de 13 anos. Não coletamos intencionalmente informações pessoais de crianças."), ("10. Mudanças nesta política", "Podemos atualizar esta política periodicamente. A data de \"Última atualização\" no topo desta página refletirá quaisquer mudanças. O uso continuado do serviço após mudanças constitui aceitação da política atualizada."), ("11. Contato", "Para dúvidas ou solicitações sobre privacidade, escreva para <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "de": {"title": "Datenschutzerklärung", "desc": "Datenschutzerklärung von ShopBG Remover. Wir erheben nur das Nötigste, verkaufen deine Daten nicht und speichern deine Bilder nicht nach der Verarbeitung.", "tag": "Rechtliches", "h1": "Datenschutzerklärung", "meta_date": "Zuletzt aktualisiert: 31. März 2026 &nbsp;·&nbsp; ShopBG Remover (betrieben von shopbgremover)", "highlight": "Wir halten es einfach: Wir erheben nur, was zum Betrieb des Dienstes nötig ist, verkaufen deine Daten nicht und deine Produktbilder werden nach Abschluss der Verarbeitung nie gespeichert.", "sections": [("1. Wer wir sind", "ShopBG Remover ist ein KI-gestütztes Tool zur Hintergrundentfernung für E-Commerce-Verkäufer, betrieben unter der Marke <strong>shopbgremover</strong>. Du erreichst uns unter <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("2. Welche Informationen wir erheben", "<p>Wir erheben nur die minimal nötigen Informationen, um den Dienst bereitzustellen:</p><ul><li><strong>Kontoinformationen:</strong> Deine E-Mail-Adresse und Anzeigename bei Anmeldung via Google OAuth oder E-Mail-OTP.</li><li><strong>Nutzungsdaten:</strong> Anzahl verarbeiteter Bilder, Zeitstempel und Credit-Stand — zur Verwaltung deines Kontos und zur Durchsetzung von Plan-Limits.</li><li><strong>Zahlungsinformationen:</strong> Bestell-ID, gekaufter Plan und Zahlungsbetrag. Wir speichern <em>nicht</em> deine Kartennummer oder vollständigen PayPal-Zugangsdaten — Zahlungen werden vollständig von PayPal abgewickelt.</li><li><strong>Technische Daten:</strong> Browsertyp, IP-Adresse und Zugriffsprotokolle, die automatisch von Cloudflare zu Sicherheits- und Leistungszwecken erhoben werden.</li></ul>"), ("3. Deine Bilder", "Deine Produktbilder werden ausschließlich zur Hintergrundentfernung an unsere KI-API gesendet. <strong>Bilder werden nach Abschluss der Verarbeitung nicht auf unseren Servern gespeichert.</strong> Verarbeitete Ergebnisse werden direkt an deinen Browser zurückgegeben und nie aufbewahrt oder für andere Zwecke verwendet."), ("4. Wie wir deine Informationen verwenden", "<ul><li>Um dich zu authentifizieren und dein Konto zu verwalten</li><li>Um Credit-Nutzung zu verfolgen und Zahlungen abzuwickeln</li><li>Um OTP-Bestätigungscodes per E-Mail zu senden (mit Resend)</li><li>Um Support-Anfragen zu beantworten</li><li>Um Missbrauch zu erkennen und zu verhindern</li></ul><p>Wir nutzen deine Daten nicht für Werbung und verkaufen oder teilen sie nicht mit Dritten zu Marketingzwecken.</p>"), ("5. Dienste Dritter", "<p>Wir nutzen folgende Dienste Dritter zum Betrieb von ShopBG Remover:</p><ul><li><strong>Cloudflare</strong> — Hosting, CDN, DNS und DDoS-Schutz</li><li><strong>Google OAuth</strong> — optionale Anmeldemethode; geregelt durch Googles Datenschutzerklärung</li><li><strong>PayPal</strong> — Zahlungsabwicklung; geregelt durch PayPals Datenschutzerklärung</li><li><strong>Resend</strong> — transaktionaler E-Mail-Versand (OTP-Codes)</li></ul>"), ("6. Cookies &amp; Local Storage", "Wir verwenden ein Session-Cookie (<code>session</code>), um dich angemeldet zu halten. Es wird auf <code>.shopbgremover.com</code> gesetzt und läuft nach 30 Tagen ab. Wir verwenden auch <code>localStorage</code> des Browsers, um kostenlose Nutzungslimits für anonyme Benutzer zu verfolgen. Wir verwenden keine Werbe-Cookies von Drittanbietern."), ("7. Datenspeicherung", "Wir speichern dein Konto und Nutzungsdaten, solange dein Konto aktiv ist. Du kannst jederzeit die Löschung deines Kontos und der zugehörigen Daten beantragen, indem du eine E-Mail an <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a> sendest. Wir bearbeiten Löschanfragen innerhalb von 30 Tagen."), ("8. Deine Rechte", "Je nach Standort hast du möglicherweise Rechte nach DSGVO, CCPA oder anderen geltenden Gesetzen, einschließlich des Rechts auf Zugriff, Korrektur oder Löschung deiner personenbezogenen Daten. Um diese Rechte auszuüben, kontaktiere uns unter <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("9. Privatsphäre von Kindern", "ShopBG Remover richtet sich nicht an Kinder unter 13 Jahren. Wir erheben nicht wissentlich personenbezogene Daten von Kindern."), ("10. Änderungen dieser Erklärung", "Wir können diese Erklärung von Zeit zu Zeit aktualisieren. Das Datum „Zuletzt aktualisiert\" oben auf dieser Seite spiegelt etwaige Änderungen wider. Die fortgesetzte Nutzung des Dienstes nach Änderungen stellt die Annahme der aktualisierten Erklärung dar."), ("11. Kontakt", "Bei Fragen oder Anfragen zum Datenschutz sende uns eine E-Mail an <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "fr": {"title": "Politique de confidentialité", "desc": "Politique de confidentialité de ShopBG Remover. Nous collectons uniquement le nécessaire, ne vendons pas vos données et vos images ne sont pas stockées après traitement.", "tag": "Mentions légales", "h1": "Politique de confidentialité", "meta_date": "Dernière mise à jour : 31 mars 2026 &nbsp;·&nbsp; ShopBG Remover (exploité par shopbgremover)", "highlight": "Nous restons simples : nous collectons uniquement ce qui est nécessaire au service, nous ne vendons pas vos données, et vos images produits ne sont jamais stockées après le traitement.", "sections": [("1. Qui nous sommes", "ShopBG Remover est un outil de suppression d'arrière-plan par IA pour vendeurs e-commerce, exploité sous la marque <strong>shopbgremover</strong>. Vous pouvez nous contacter à <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("2. Informations que nous collectons", "<p>Nous collectons le minimum d'informations nécessaires pour fournir le service :</p><ul><li><strong>Informations de compte :</strong> Votre adresse e-mail et nom d'affichage lors de la connexion via Google OAuth ou code par e-mail.</li><li><strong>Données d'utilisation :</strong> Nombre d'images traitées, horodatages et solde de crédits — pour gérer votre compte et appliquer les limites de plan.</li><li><strong>Informations de paiement :</strong> ID de commande, plan acheté et montant du paiement. Nous ne stockons <em>pas</em> votre numéro de carte ou identifiants PayPal complets — les paiements sont gérés entièrement par PayPal.</li><li><strong>Données techniques :</strong> Type de navigateur, adresse IP et journaux d'accès collectés automatiquement par Cloudflare pour la sécurité et la performance.</li></ul>"), ("3. Vos images", "Vos images produits sont envoyées à notre API de traitement IA uniquement pour la suppression d'arrière-plan. <strong>Les images ne sont pas stockées sur nos serveurs après le traitement.</strong> Les résultats traités sont renvoyés directement à votre navigateur et ne sont jamais conservés ni utilisés à d'autres fins."), ("4. Comment nous utilisons vos informations", "<ul><li>Pour vous authentifier et gérer votre compte</li><li>Pour suivre l'utilisation des crédits et traiter les paiements</li><li>Pour envoyer des codes de vérification par e-mail (avec Resend)</li><li>Pour répondre aux demandes de support</li><li>Pour détecter et prévenir les abus</li></ul><p>Nous n'utilisons pas vos données pour la publicité, et nous ne les vendons ni ne les partageons avec des tiers à des fins marketing.</p>"), ("5. Services tiers", "<p>Nous utilisons les services tiers suivants pour exploiter ShopBG Remover :</p><ul><li><strong>Cloudflare</strong> — hébergement, CDN, DNS et protection DDoS</li><li><strong>Google OAuth</strong> — méthode de connexion optionnelle ; régie par la Politique de Confidentialité de Google</li><li><strong>PayPal</strong> — traitement des paiements ; régi par la Politique de Confidentialité de PayPal</li><li><strong>Resend</strong> — envoi d'e-mails transactionnels (codes OTP)</li></ul>"), ("6. Cookies et stockage local", "Nous utilisons un cookie de session (<code>session</code>) pour vous maintenir connecté. Il est défini sur <code>.shopbgremover.com</code> et expire après 30 jours. Nous utilisons aussi le <code>localStorage</code> du navigateur pour suivre les limites d'utilisation gratuite des utilisateurs anonymes. Nous n'utilisons pas de cookies publicitaires tiers."), ("7. Conservation des données", "Nous conservons votre compte et vos enregistrements d'utilisation tant que votre compte est actif. Vous pouvez demander la suppression de votre compte et des données associées à tout moment en envoyant un e-mail à <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Nous traiterons les demandes de suppression sous 30 jours."), ("8. Vos droits", "Selon votre localisation, vous pouvez avoir des droits au titre du RGPD, du CCPA ou d'autres lois applicables, incluant le droit d'accéder, corriger ou supprimer vos données personnelles. Pour exercer ces droits, contactez-nous à <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>."), ("9. Vie privée des enfants", "ShopBG Remover n'est pas destiné aux enfants de moins de 13 ans. Nous ne collectons pas sciemment d'informations personnelles auprès d'enfants."), ("10. Modifications de cette politique", "Nous pouvons mettre à jour cette politique de temps à autre. La date « Dernière mise à jour » en haut de cette page reflétera tout changement. L'utilisation continue du service après modifications constitue l'acceptation de la politique mise à jour."), ("11. Contact", "Pour toute question ou demande liée à la confidentialité, écrivez-nous à <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
}

# ─── terms 页文案（13 sections）───
TERMS = {
    "es": {"title": "Términos de servicio", "desc": "Términos de servicio de ShopBG Remover. Escritos en lenguaje claro y justo para ti y nosotros.", "tag": "Legal", "h1": "Términos de servicio", "meta_date": "Última actualización: 31 de marzo de 2026 &nbsp;·&nbsp; ShopBG Remover (operado por shopbgremover)", "highlight": "Al usar ShopBG Remover, aceptas estos términos. Por favor léelos — están escritos en lenguaje claro y diseñados para ser justos contigo y con nosotros.", "sections": [("1. El servicio", "ShopBG Remover provee remoción de fondo con IA para imágenes de productos, diseñado para vendedores de e-commerce en plataformas como Shopify, Amazon e eBay. El servicio opera bajo la marca <strong>shopbgremover</strong>."), ("2. Elegibilidad", "Debes tener al menos 18 años para usar este servicio. Al crear una cuenta, confirmas que cumples este requisito."), ("3. Tu cuenta", "Eres responsable de mantener seguras tus credenciales de cuenta. Puedes iniciar sesión vía Google OAuth o código por correo. Eres responsable de toda actividad que ocurra bajo tu cuenta."), ("4. Créditos y planes", "<ul><li><strong>Nivel gratis:</strong> Las cuentas nuevas reciben 5 créditos gratis al registrarse. Los usuarios anónimos pueden procesar hasta 3 imágenes por día.</li><li><strong>Créditos pagados:</strong> Los créditos se compran por adelantado y se descuentan al procesar imágenes con éxito. Los créditos no caducan.</li><li><strong>Pago por uso:</strong> Disponible en paquetes fijos. Todas las ventas son finales una vez que los créditos se agregan a tu cuenta.</li></ul>"), ("5. Pagos y reembolsos", "<p>Todos los pagos los procesa PayPal. Los precios están en USD. Al completar una compra, autorizas el cargo a tu cuenta PayPal.</p><p><strong>Política de reembolso:</strong> Ofrecemos reembolsos de compras de créditos no usados dentro de 7 días si no has usado ningún crédito de esa compra. Para solicitar un reembolso, contáctanos en <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. No ofrecemos reembolsos parciales de paquetes de créditos parcialmente usados.</p>"), ("6. Uso aceptable", "<p>Aceptas no:</p><ul><li>Subir imágenes que contengan contenido ilegal, incluyendo CSAM o contenido que viole derechos de terceros</li><li>Intentar hacer ingeniería inversa, scraping o abusar de la API</li><li>Usar herramientas automatizadas para eludir límites de tasa o requisitos de créditos</li><li>Revender o redistribuir el servicio sin nuestro permiso por escrito</li></ul><p>Nos reservamos el derecho de suspender o terminar cuentas que violen estos términos.</p>"), ("7. Tus imágenes y propiedad intelectual", "<p>Mantienes la propiedad completa de todas las imágenes que subes y los resultados procesados que descargas. Al subir imágenes, nos otorgas una licencia temporal y limitada para procesarlas únicamente con el fin de entregar el servicio. No reclamamos ningún derecho sobre tus imágenes.</p><p>Declaras que eres dueño o tienes derecho a usar las imágenes que subes, y que no infringen derechos de propiedad intelectual de terceros.</p>"), ("8. Disponibilidad del servicio", "Nos esforzamos por proveer un servicio confiable pero no garantizamos 100 % de disponibilidad. Podemos realizar mantenimiento, actualizaciones o cambios al servicio en cualquier momento. No somos responsables de pérdidas resultantes de interrupciones del servicio."), ("9. Limitación de responsabilidad", "<p>Hasta el máximo permitido por la ley, ShopBG Remover no será responsable por daños indirectos, incidentales, especiales o consecuentes derivados de tu uso del servicio — incluyendo pérdida de ganancias, datos u oportunidades de negocio.</p><p>Nuestra responsabilidad total por cualquier reclamo derivado de estos términos no excederá el monto que nos pagaste en los 30 días previos al reclamo.</p>"), ("10. Renuncia de garantías", "El servicio se proporciona \"tal cual\" y \"según disponibilidad\" sin garantías de ningún tipo, expresas o implícitas, incluyendo la precisión de los resultados de procesamiento IA. La calidad de la remoción de fondo IA puede variar según la complejidad de la imagen."), ("11. Cambios en los términos", "Podemos actualizar estos términos en cualquier momento. La fecha de \"Última actualización\" arriba refleja la versión más reciente. El uso continuado del servicio tras los cambios constituye aceptación de los términos actualizados."), ("12. Ley aplicable", "Estos términos se rigen por la ley aplicable. Cualquier disputa se resolverá primero mediante negociación de buena fe. Si tienes una preocupación, por favor contáctanos antes de iniciar cualquier acción formal."), ("13. Contacto", "¿Preguntas sobre estos términos? Escríbenos a <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "pt-BR": {"title": "Termos de serviço", "desc": "Termos de serviço do ShopBG Remover. Escritos em linguagem clara e justa para você e para nós.", "tag": "Legal", "h1": "Termos de serviço", "meta_date": "Última atualização: 31 de março de 2026 &nbsp;·&nbsp; ShopBG Remover (operado por shopbgremover)", "highlight": "Ao usar o ShopBG Remover, você concorda com estes termos. Por favor leia — estão escritos em linguagem clara e foram pensados para serem justos com você e conosco.", "sections": [("1. O serviço", "O ShopBG Remover oferece remoção de fundo com IA para imagens de produtos, projetado para vendedores de e-commerce em plataformas como Shopify, Amazon e eBay. O serviço opera sob a marca <strong>shopbgremover</strong>."), ("2. Elegibilidade", "Você precisa ter pelo menos 18 anos para usar este serviço. Ao criar uma conta, você confirma que atende a este requisito."), ("3. Sua conta", "Você é responsável por manter suas credenciais de conta seguras. Pode entrar via Google OAuth ou código por e-mail. Você é responsável por toda atividade que ocorrer sob sua conta."), ("4. Créditos e planos", "<ul><li><strong>Nível grátis:</strong> Novas contas recebem 5 créditos grátis ao se cadastrar. Usuários anônimos podem processar até 3 imagens por dia.</li><li><strong>Créditos pagos:</strong> Créditos são comprados antecipadamente e debitados após o processamento bem-sucedido. Créditos não expiram.</li><li><strong>Pré-pago:</strong> Disponível em pacotes fixos. Todas as vendas são finais assim que os créditos são adicionados à sua conta.</li></ul>"), ("5. Pagamentos e reembolsos", "<p>Todos os pagamentos são processados pelo PayPal. Preços em USD. Ao completar uma compra, você autoriza a cobrança em sua conta PayPal.</p><p><strong>Política de reembolso:</strong> Oferecemos reembolso de créditos não usados dentro de 7 dias se você não tiver usado nenhum crédito daquela compra. Para solicitar reembolso, contate <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Não oferecemos reembolsos parciais de pacotes de créditos parcialmente usados.</p>"), ("6. Uso aceitável", "<p>Você concorda em não:</p><ul><li>Enviar imagens com conteúdo ilegal, incluindo CSAM ou conteúdo que viole direitos de terceiros</li><li>Tentar fazer engenharia reversa, scraping ou abusar da API</li><li>Usar ferramentas automatizadas para contornar limites de taxa ou requisitos de créditos</li><li>Revender ou redistribuir o serviço sem nossa permissão por escrito</li></ul><p>Reservamos o direito de suspender ou encerrar contas que violem estes termos.</p>"), ("7. Suas imagens e propriedade intelectual", "<p>Você mantém propriedade total de todas as imagens enviadas e dos resultados processados que baixa. Ao enviar imagens, você nos concede uma licença temporária e limitada para processá-las unicamente com o propósito de entregar o serviço. Não reivindicamos direitos sobre suas imagens.</p><p>Você declara que é proprietário ou tem o direito de usar as imagens que envia, e que elas não infringem direitos de propriedade intelectual de terceiros.</p>"), ("8. Disponibilidade do serviço", "Buscamos oferecer um serviço confiável mas não garantimos 100 % de disponibilidade. Podemos realizar manutenção, atualizações ou mudanças no serviço a qualquer momento. Não somos responsáveis por perdas resultantes de interrupções do serviço."), ("9. Limitação de responsabilidade", "<p>Até o máximo permitido por lei, o ShopBG Remover não será responsável por danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso do serviço — incluindo perda de lucros, dados ou oportunidades de negócio.</p><p>Nossa responsabilidade total por qualquer reivindicação decorrente destes termos não excederá o valor pago a nós nos 30 dias anteriores à reivindicação.</p>"), ("10. Isenção de garantias", "O serviço é fornecido \"como está\" e \"conforme disponível\" sem garantias de qualquer tipo, expressas ou implícitas, incluindo precisão dos resultados de processamento de IA. A qualidade da remoção de fundo por IA pode variar conforme a complexidade da imagem."), ("11. Mudanças nos termos", "Podemos atualizar estes termos a qualquer momento. A data de \"Última atualização\" no topo reflete a versão mais recente. O uso continuado do serviço após mudanças constitui aceitação dos termos atualizados."), ("12. Lei aplicável", "Estes termos são regidos pela lei aplicável. Quaisquer disputas serão resolvidas primeiro por negociação de boa-fé. Se tiver uma preocupação, por favor entre em contato antes de iniciar qualquer ação formal."), ("13. Contato", "Dúvidas sobre estes termos? Escreva para <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "de": {"title": "Allgemeine Geschäftsbedingungen", "desc": "AGB von ShopBG Remover. In klarer Sprache und fair für dich und uns geschrieben.", "tag": "Rechtliches", "h1": "Allgemeine Geschäftsbedingungen", "meta_date": "Zuletzt aktualisiert: 31. März 2026 &nbsp;·&nbsp; ShopBG Remover (betrieben von shopbgremover)", "highlight": "Mit der Nutzung von ShopBG Remover stimmst du diesen Bedingungen zu. Bitte lies sie — sie sind in klarer Sprache geschrieben und so gestaltet, dass sie für dich und uns fair sind.", "sections": [("1. Der Dienst", "ShopBG Remover bietet KI-gestützte Hintergrundentfernung für Produktbilder, entwickelt für E-Commerce-Verkäufer auf Plattformen wie Shopify, Amazon und eBay. Der Dienst wird unter der Marke <strong>shopbgremover</strong> betrieben."), ("2. Berechtigung", "Du musst mindestens 18 Jahre alt sein, um diesen Dienst zu nutzen. Mit der Erstellung eines Kontos bestätigst du, dass du diese Anforderung erfüllst."), ("3. Dein Konto", "Du bist verantwortlich, deine Kontodaten sicher aufzubewahren. Du kannst dich via Google OAuth oder E-Mail-OTP anmelden. Du bist für alle Aktivitäten verantwortlich, die unter deinem Konto stattfinden."), ("4. Credits &amp; Pläne", "<ul><li><strong>Kostenlose Stufe:</strong> Neue Konten erhalten 5 kostenlose Credits bei der Registrierung. Anonyme Benutzer können bis zu 3 Bilder pro Tag verarbeiten.</li><li><strong>Bezahlte Credits:</strong> Credits werden im Voraus gekauft und nach erfolgreicher Bildverarbeitung abgezogen. Credits verfallen nicht.</li><li><strong>Pay-as-you-go:</strong> Verfügbar in festen Paketen. Alle Verkäufe sind endgültig, sobald Credits deinem Konto hinzugefügt wurden.</li></ul>"), ("5. Zahlungen &amp; Erstattungen", "<p>Alle Zahlungen werden von PayPal abgewickelt. Preise sind in USD angegeben. Mit Abschluss eines Kaufs autorisierst du die Belastung deines PayPal-Kontos.</p><p><strong>Rückerstattungsrichtlinie:</strong> Wir bieten Rückerstattungen für ungenutzte Credit-Käufe innerhalb von 7 Tagen an, sofern du keine Credits aus diesem Kauf verwendet hast. Um eine Rückerstattung anzufordern, kontaktiere uns unter <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Wir bieten keine Teilrückerstattungen für teilweise genutzte Credit-Pakete an.</p>"), ("6. Akzeptable Nutzung", "<p>Du verpflichtest dich, nicht:</p><ul><li>Bilder mit illegalem Inhalt hochzuladen, einschließlich CSAM oder Inhalten, die Rechte Dritter verletzen</li><li>Die API zu reverse-engineeren, zu scrapen oder zu missbrauchen</li><li>Automatisierte Tools zu verwenden, um Rate-Limits oder Credit-Anforderungen zu umgehen</li><li>Den Dienst ohne unsere schriftliche Genehmigung weiterzuverkaufen oder weiterzugeben</li></ul><p>Wir behalten uns das Recht vor, Konten zu sperren oder zu beenden, die diese Bedingungen verletzen.</p>"), ("7. Deine Bilder &amp; geistiges Eigentum", "<p>Du behältst das volle Eigentum an allen hochgeladenen Bildern und den heruntergeladenen verarbeiteten Ergebnissen. Mit dem Hochladen von Bildern gewährst du uns eine temporäre, begrenzte Lizenz zur Verarbeitung ausschließlich zum Zweck der Diensterbringung. Wir beanspruchen keine Rechte an deinen Bildern.</p><p>Du erklärst, dass du Eigentümer der hochgeladenen Bilder bist oder das Recht zu deren Nutzung hast und dass sie keine geistigen Eigentumsrechte Dritter verletzen.</p>"), ("8. Verfügbarkeit des Dienstes", "Wir bemühen uns, einen zuverlässigen Dienst zu bieten, garantieren aber keine 100-prozentige Verfügbarkeit. Wir können jederzeit Wartung, Updates oder Änderungen am Dienst vornehmen. Wir haften nicht für Verluste, die durch Dienstunterbrechungen entstehen."), ("9. Haftungsbeschränkung", "<p>Soweit gesetzlich zulässig, haftet ShopBG Remover nicht für indirekte, zufällige, besondere oder Folgeschäden, die aus deiner Nutzung des Dienstes entstehen — einschließlich entgangener Gewinne, Daten oder Geschäftsmöglichkeiten.</p><p>Unsere Gesamthaftung für Ansprüche aus diesen Bedingungen übersteigt nicht den Betrag, den du uns in den 30 Tagen vor dem Anspruch gezahlt hast.</p>"), ("10. Gewährleistungsausschluss", "Der Dienst wird „wie besehen\" und „wie verfügbar\" ohne Gewährleistungen jeglicher Art bereitgestellt, ausdrücklich oder stillschweigend, einschließlich der Genauigkeit der KI-Verarbeitungsergebnisse. Die Qualität der KI-Hintergrundentfernung kann je nach Bildkomplexität variieren."), ("11. Änderungen der Bedingungen", "Wir können diese Bedingungen jederzeit aktualisieren. Das Datum „Zuletzt aktualisiert\" oben spiegelt die aktuellste Version wider. Die fortgesetzte Nutzung des Dienstes nach Änderungen stellt die Annahme der aktualisierten Bedingungen dar."), ("12. Anwendbares Recht", "Diese Bedingungen unterliegen dem anwendbaren Recht. Streitigkeiten werden zuerst durch gutgläubige Verhandlung gelöst. Wenn du ein Anliegen hast, kontaktiere uns bitte vor jeder formellen Maßnahme."), ("13. Kontakt", "Fragen zu diesen Bedingungen? Sende uns eine E-Mail an <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
    "fr": {"title": "Conditions d'utilisation", "desc": "Conditions d'utilisation de ShopBG Remover. Écrites en langage clair et équitables pour vous et nous.", "tag": "Mentions légales", "h1": "Conditions d'utilisation", "meta_date": "Dernière mise à jour : 31 mars 2026 &nbsp;·&nbsp; ShopBG Remover (exploité par shopbgremover)", "highlight": "En utilisant ShopBG Remover, vous acceptez ces conditions. Veuillez les lire — elles sont écrites en langage clair et conçues pour être équitables envers vous et nous.", "sections": [("1. Le service", "ShopBG Remover fournit la suppression d'arrière-plan par IA pour les images produits, conçu pour les vendeurs e-commerce sur des plateformes comme Shopify, Amazon et eBay. Le service est exploité sous la marque <strong>shopbgremover</strong>."), ("2. Éligibilité", "Vous devez avoir au moins 18 ans pour utiliser ce service. En créant un compte, vous confirmez répondre à cette exigence."), ("3. Votre compte", "Vous êtes responsable de la sécurité de vos identifiants de compte. Vous pouvez vous connecter via Google OAuth ou code par e-mail. Vous êtes responsable de toute activité se déroulant sous votre compte."), ("4. Crédits et plans", "<ul><li><strong>Niveau gratuit :</strong> Les nouveaux comptes reçoivent 5 crédits gratuits à l'inscription. Les utilisateurs anonymes peuvent traiter jusqu'à 3 images par jour.</li><li><strong>Crédits payants :</strong> Les crédits sont achetés à l'avance et débités après traitement réussi. Les crédits n'expirent pas.</li><li><strong>À la carte :</strong> Disponible en packs fixes. Toutes les ventes sont définitives dès que les crédits sont ajoutés à votre compte.</li></ul>"), ("5. Paiements et remboursements", "<p>Tous les paiements sont traités par PayPal. Prix indiqués en USD. En complétant un achat, vous autorisez le débit de votre compte PayPal.</p><p><strong>Politique de remboursement :</strong> Nous offrons des remboursements sur les crédits non utilisés dans les 7 jours si vous n'avez utilisé aucun crédit de cet achat. Pour demander un remboursement, contactez <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>. Nous n'offrons pas de remboursements partiels pour des packs de crédits partiellement utilisés.</p>"), ("6. Utilisation acceptable", "<p>Vous acceptez de ne pas :</p><ul><li>Téléverser d'images contenant du contenu illégal, incluant CSAM ou contenu violant les droits de tiers</li><li>Tenter de faire de l'ingénierie inverse, du scraping ou d'abuser de l'API</li><li>Utiliser des outils automatisés pour contourner les limites de taux ou les exigences de crédits</li><li>Revendre ou redistribuer le service sans notre permission écrite</li></ul><p>Nous nous réservons le droit de suspendre ou résilier les comptes qui violent ces conditions.</p>"), ("7. Vos images et propriété intellectuelle", "<p>Vous conservez la pleine propriété de toutes les images que vous téléversez et des résultats traités que vous téléchargez. En téléversant des images, vous nous accordez une licence temporaire et limitée pour les traiter uniquement dans le but de fournir le service. Nous ne revendiquons aucun droit sur vos images.</p><p>Vous déclarez être propriétaire ou avoir le droit d'utiliser les images téléversées, et qu'elles ne violent aucun droit de propriété intellectuelle tiers.</p>"), ("8. Disponibilité du service", "Nous visons à fournir un service fiable mais ne garantissons pas 100 % de disponibilité. Nous pouvons effectuer maintenance, mises à jour ou modifications du service à tout moment. Nous ne sommes pas responsables des pertes résultant d'interruptions du service."), ("9. Limitation de responsabilité", "<p>Dans la mesure maximale permise par la loi, ShopBG Remover ne sera pas responsable des dommages indirects, accessoires, spéciaux ou consécutifs découlant de votre utilisation du service — incluant perte de profits, données ou opportunités d'affaires.</p><p>Notre responsabilité totale pour toute réclamation découlant de ces conditions ne dépassera pas le montant que vous nous avez payé dans les 30 jours précédant la réclamation.</p>"), ("10. Exclusion de garanties", "Le service est fourni « tel quel » et « selon disponibilité » sans garanties d'aucune sorte, expresses ou implicites, incluant l'exactitude des résultats de traitement IA. La qualité de la suppression d'arrière-plan IA peut varier selon la complexité de l'image."), ("11. Modifications des conditions", "Nous pouvons mettre à jour ces conditions à tout moment. La date « Dernière mise à jour » en haut reflète la version la plus récente. L'utilisation continue du service après modifications constitue l'acceptation des conditions mises à jour."), ("12. Loi applicable", "Ces conditions sont régies par la loi applicable. Tout litige sera résolu d'abord par négociation de bonne foi. Si vous avez une préoccupation, veuillez nous contacter avant d'engager toute action formelle."), ("13. Contact", "Des questions sur ces conditions ? Écrivez-nous à <a href=\"mailto:yubudong2023@gmail.com\">yubudong2023@gmail.com</a>.")]},
}


# ─── 公共 CSS（contact 单独，privacy/terms 共用） ───
CSS_CONTACT = """*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0c0c0e;--surface:#161619;--surface2:#1e1e22;--text:#e8e8e6;--text2:#9a9a96;--text3:#6a6a66;--border:#2a2a2e;--border2:#3a3a3e;--accent:#6c5ce7;--accent2:#a29bfe;--green:#00b894;--green-bg:rgba(0,184,148,0.1);--r:12px;--font:'Outfit',sans-serif}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
.navbar{position:sticky;top:0;z-index:50;background:#0A0A0A;border-bottom:1px solid rgba(255,255,255,0.07);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-links{display:flex;gap:28px}
.nav-links a{color:#9CA3AF;text-decoration:none;font-size:14px;font-weight:500;transition:color 0.2s}
.nav-links a:hover{color:#fff}
.nav-right{display:flex;align-items:center;gap:12px}
.credits-badge{display:none;align-items:center;background:rgba(59,130,246,0.12);color:#60A5FA;border:1px solid rgba(59,130,246,0.25);border-radius:20px;padding:5px 14px;font-size:13px;font-weight:600}
.credits-badge.show{display:flex}
.user-name{font-size:13px;color:#D1D5DB}
.btn-nav{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all 0.2s}
.btn-nav-login{background:#3B82F6;color:#fff}
.btn-nav-login:hover{background:#2563EB;transform:translateY(-1px)}
@media(max-width:800px){.nav-links{display:none}.navbar{padding:0 20px}}
.container{max-width:580px;margin:0 auto;padding:80px 24px 96px;text-align:center}
.icon{font-size:48px;margin-bottom:24px;display:block}
h1{font-size:clamp(28px,4vw,38px);font-weight:800;letter-spacing:-.03em;margin-bottom:14px}
.subtitle{font-size:16px;color:var(--text2);margin-bottom:48px;max-width:420px;margin-left:auto;margin-right:auto}
.contact-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px;margin-bottom:24px;text-align:left}
.contact-card-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:16px}
.contact-email{display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--r);padding:16px 20px;margin-bottom:16px}
.contact-email-icon{font-size:20px;flex-shrink:0}
.contact-email-info{flex:1}
.contact-email-label{font-size:12px;color:var(--text3);margin-bottom:2px}
.contact-email-addr{font-size:15px;font-weight:600;color:var(--text)}
.contact-email-addr a{color:var(--text);text-decoration:none}
.contact-email-addr a:hover{color:var(--accent2)}
.mailto-btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:100px;text-decoration:none;transition:all .15s;margin-top:8px}
.mailto-btn:hover{background:var(--accent2);color:var(--bg);text-decoration:none}
.faq-hint{background:var(--green-bg);border:1px solid rgba(0,184,148,.2);border-radius:var(--r);padding:20px 24px;margin-top:24px;text-align:left}
.faq-hint-title{font-size:13px;font-weight:700;color:var(--green);margin-bottom:6px}
.faq-hint p{font-size:14px;color:var(--text2);margin:0}
.faq-hint a{color:var(--green)}
.response-time{font-size:13px;color:var(--text3);margin-top:20px}
.footer{background:#0A0A0A;border-top:1px solid rgba(255,255,255,0.07);padding:40px 24px;text-align:center}
.footer-logo{font-size:15px;font-weight:700;color:white;margin-bottom:16px}
.footer-links{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:18px}
.footer-links a{color:#6B7280;text-decoration:none;font-size:13px;transition:color 0.2s}
.footer-links a:hover{color:#9CA3AF}
.footer-copy{color:#4B5563;font-size:12px}
.footer a{color:var(--text2)}
.lang-switcher{position:relative}
.lang-btn{background:rgba(255,255,255,0.08);color:#E5E7EB;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background 0.2s}
.lang-btn:hover{background:rgba(255,255,255,0.14)}
.lang-caret{font-size:10px;opacity:0.7}
.lang-menu{display:none;position:absolute;top:calc(100% + 8px);right:0;background:#1F2937;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:200px;padding:6px 0;list-style:none;box-shadow:0 10px 32px rgba(0,0,0,0.4);z-index:100}
.lang-menu.open{display:block}
.lang-menu li{margin:0}
.lang-menu a{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;color:#D1D5DB;text-decoration:none;font-size:13px}
.lang-menu a:hover{background:rgba(255,255,255,0.08);color:#fff}
.lang-menu a.active{color:#60A5FA;font-weight:700}
.lang-menu .lang-code{font-size:11px;color:#6B7280;font-weight:600;letter-spacing:0.05em}
.lang-menu a.active .lang-code{color:#60A5FA}
.footer-langs{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;font-size:12px}
.footer-langs a{color:#6B7280;text-decoration:none;padding:4px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;transition:all 0.2s}
.footer-langs a:hover{color:#fff;border-color:rgba(255,255,255,0.2)}
.footer-langs a.active{color:#60A5FA;border-color:rgba(96,165,250,0.3)}"""

CSS_LEGAL = """*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0c0c0e;--surface:#161619;--surface2:#1e1e22;--text:#e8e8e6;--text2:#9a9a96;--text3:#6a6a66;--border:#2a2a2e;--accent:#6c5ce7;--accent2:#a29bfe;--r:12px;--font:'Outfit',sans-serif}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
.navbar{position:sticky;top:0;z-index:50;background:#0A0A0A;border-bottom:1px solid rgba(255,255,255,0.07);padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-links{display:flex;gap:28px}
.nav-links a{color:#9CA3AF;text-decoration:none;font-size:14px;font-weight:500;transition:color 0.2s}
.nav-links a:hover{color:#fff}
.nav-right{display:flex;align-items:center;gap:12px}
.credits-badge{display:none;align-items:center;background:rgba(59,130,246,0.12);color:#60A5FA;border:1px solid rgba(59,130,246,0.25);border-radius:20px;padding:5px 14px;font-size:13px;font-weight:600}
.credits-badge.show{display:flex}
.user-name{font-size:13px;color:#D1D5DB}
.btn-nav{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all 0.2s}
.btn-nav-login{background:#3B82F6;color:#fff}
.btn-nav-login:hover{background:#2563EB;transform:translateY(-1px)}
@media(max-width:800px){.nav-links{display:none}.navbar{padding:0 20px}}
.container{max-width:720px;margin:0 auto;padding:64px 24px 96px}
.page-tag{display:inline-block;font-size:12px;font-weight:700;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}
h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-.03em;margin-bottom:12px}
.meta{font-size:14px;color:var(--text3);margin-bottom:48px;padding-bottom:32px;border-bottom:1px solid var(--border)}
h2{font-size:18px;font-weight:700;margin:40px 0 12px;color:var(--text)}
p{font-size:15px;color:var(--text2);margin-bottom:14px}
ul{font-size:15px;color:var(--text2);padding-left:20px;margin-bottom:14px}
ul li{margin-bottom:6px}
.highlight-box{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent2);border-radius:var(--r);padding:20px 24px;margin:32px 0}
.highlight-box p{margin:0;font-size:14px}
.footer{background:#0A0A0A;border-top:1px solid rgba(255,255,255,0.07);padding:40px 24px;text-align:center}
.footer-logo{font-size:15px;font-weight:700;color:white;margin-bottom:16px}
.footer-links{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:18px}
.footer-links a{color:#6B7280;text-decoration:none;font-size:13px;transition:color 0.2s}
.footer-links a:hover{color:#9CA3AF}
.footer-copy{color:#4B5563;font-size:12px}
.lang-switcher{position:relative}
.lang-btn{background:rgba(255,255,255,0.08);color:#E5E7EB;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background 0.2s}
.lang-btn:hover{background:rgba(255,255,255,0.14)}
.lang-caret{font-size:10px;opacity:0.7}
.lang-menu{display:none;position:absolute;top:calc(100% + 8px);right:0;background:#1F2937;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:200px;padding:6px 0;list-style:none;box-shadow:0 10px 32px rgba(0,0,0,0.4);z-index:100}
.lang-menu.open{display:block}
.lang-menu li{margin:0}
.lang-menu a{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;color:#D1D5DB;text-decoration:none;font-size:13px}
.lang-menu a:hover{background:rgba(255,255,255,0.08);color:#fff}
.lang-menu a.active{color:#60A5FA;font-weight:700}
.lang-menu .lang-code{font-size:11px;color:#6B7280;font-weight:600;letter-spacing:0.05em}
.lang-menu a.active .lang-code{color:#60A5FA}
.footer-langs{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;font-size:12px}
.footer-langs a{color:#6B7280;text-decoration:none;padding:4px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;transition:all 0.2s}
.footer-langs a:hover{color:#fff;border-color:rgba(255,255,255,0.2)}
.footer-langs a.active{color:#60A5FA;border-color:rgba(96,165,250,0.3)}"""

LANG_JS = """function toggleLangMenu(e){e.stopPropagation();document.getElementById('langMenu').classList.toggle('open')}
document.addEventListener('click',function(e){var m=document.getElementById('langMenu');var s=document.querySelector('.lang-switcher');if(m&&s&&!s.contains(e.target))m.classList.remove('open')});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.getElementById('langMenu');if(m)m.classList.remove('open')}});"""


# ─── 渲染辅助 ───
def page_url(prefix, slug):
    return f"{prefix}/{slug}" if slug else f"{prefix}/"


def hreflang_block(slug):
    lines = []
    for code, _, _, _, _, _, _ in LANGS:
        href = f"{BASE_URL}{PREFIX[code]}/{slug}"
        lines.append(f'<link rel="alternate" hreflang="{code}" href="{href}" />')
    lines.append(f'<link rel="alternate" hreflang="x-default" href="{BASE_URL}/{slug}" />')
    return "\n".join(lines)


def nav_html(current_lang, slug, nav_text, sign_in_text, credits_word, change_lang_aria, label_short):
    prefix = PREFIX[current_lang]
    lang_items = []
    for code, _, full, short, _, _, _ in LANGS:
        active = ' class="active"' if code == current_lang else ""
        lang_items.append(
            f'<li role="none"><a role="menuitem" href="{PREFIX[code]}/{slug}" hreflang="{code}"{active}>{full} <span class="lang-code">{short}</span></a></li>'
        )
    return f'''<nav class="navbar">
  <a class="nav-logo" href="{prefix}/"><img src="/Logo256.png" alt="ShopBG Remover" style="height:32px;width:auto;display:block;"></a>
  <div class="nav-links">
    <a href="{prefix}/#how">{nav_text["how"]}</a>
    <a href="{prefix}/pricing">{nav_text["pricing"]}</a>
    <a href="{prefix}/shopify-background-remover">{nav_text["shopify"]}</a>
    <a href="{prefix}/amazon-ebay-product-images">{nav_text["amazon"]}</a>
  </div>
  <div class="nav-right">
    <div class="credits-badge" id="creditsBadge"><span id="creditsText">— {credits_word}</span></div>
    <span class="user-name" id="userName"></span>
    <div class="lang-switcher">
      <button class="lang-btn" onclick="toggleLangMenu(event)" aria-label="{change_lang_aria}" aria-haspopup="true">
        <span>🌐 {label_short}</span><span class="lang-caret">▾</span>
      </button>
      <ul class="lang-menu" id="langMenu" role="menu">
        {chr(10).join(lang_items)}
      </ul>
    </div>
    <button class="btn-nav btn-nav-login" id="authBtn" onclick="window.location.href='{prefix}/'">{sign_in_text}</button>
  </div>
</nav>'''


def footer_html(current_lang, slug, footer_text, change_lang_aria):
    prefix = PREFIX[current_lang]
    lang_items = []
    for code, _, full, _, _, _, _ in LANGS:
        active = ' class="active"' if code == current_lang else ""
        lang_items.append(f'<a href="{PREFIX[code]}/{slug}" hreflang="{code}"{active}>{full}</a>')
    return f'''<footer class="footer">
  <div class="footer-logo">ShopBG Remover</div>
  <div class="footer-links">
    <a href="{prefix}/pricing">{footer_text["pricing"]}</a>
    <a href="{prefix}/shopify-background-remover">{footer_text["shopify"]}</a>
    <a href="{prefix}/amazon-ebay-product-images">{footer_text["amazon"]}</a>
    <a href="{prefix}/contact">{footer_text["contact"]}</a>
    <a href="{prefix}/privacy">{footer_text["privacy"]}</a>
    <a href="{prefix}/terms">{footer_text["terms"]}</a>
  </div>
  <div class="footer-langs" aria-label="{change_lang_aria}">
    {chr(10).join(lang_items)}
  </div>
  <div class="footer-copy">{footer_text["copy"]}</div>
</footer>'''


# ─── 渲染 contact ───
def render_contact(lang_code, og_locale, label_short, change_lang_aria, sign_in_text, credits_word):
    d = CONTACT[lang_code]
    nav_text = NAV[lang_code]
    footer_text = FOOTER[lang_code]
    pricing_url = f"{PREFIX[lang_code]}/pricing"
    return f'''<!DOCTYPE html>
<html lang="{lang_code}">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GMM5Z81M3X"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','G-GMM5Z81M3X')</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{d["title"]} – ShopBG Remover</title>
<meta property="og:locale" content="{og_locale}">
<meta name="description" content="{d["desc"]}">
<link rel="canonical" href="{BASE_URL}{PREFIX[lang_code]}/contact">
{hreflang_block("contact")}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS_CONTACT}</style>
</head>
<body>
{nav_html(lang_code, "contact", nav_text, sign_in_text, credits_word, change_lang_aria, label_short)}

<div class="container">
  <span class="icon">✉️</span>
  <h1>{d["h1"]}</h1>
  <p class="subtitle">{d["subtitle"]}</p>

  <div class="contact-card">
    <div class="contact-card-title">{d["card_title"]}</div>
    <div class="contact-email">
      <span class="contact-email-icon">📬</span>
      <div class="contact-email-info">
        <div class="contact-email-label">{d["email_label"]}</div>
        <div class="contact-email-addr"><a href="mailto:yubudong2023@gmail.com">yubudong2023@gmail.com</a></div>
      </div>
    </div>
    <a class="mailto-btn" href="mailto:yubudong2023@gmail.com?subject={d["mail_subject"]}">
      ✉️ &nbsp;{d["btn"]}
    </a>
    <p class="response-time">{d["response"]}</p>
  </div>

  <div class="faq-hint">
    <div class="faq-hint-title">{d["faq_title"]}</div>
    <p>{d["faq_body"].format(pricing_url=pricing_url)}</p>
  </div>
</div>

{footer_html(lang_code, "contact", footer_text, change_lang_aria)}

<script>{LANG_JS}</script>
</body>
</html>
'''


# ─── 渲染 privacy / terms ───
def render_legal(lang_code, og_locale, label_short, change_lang_aria, sign_in_text, credits_word, slug, data_dict):
    d = data_dict[lang_code]
    nav_text = NAV[lang_code]
    footer_text = FOOTER[lang_code]
    sections_html = ""
    for h2, body in d["sections"]:
        if body.startswith("<p>") or body.startswith("<ul>"):
            # raw body
            sections_html += f"\n  <h2>{h2}</h2>\n  {body}\n"
        else:
            sections_html += f"\n  <h2>{h2}</h2>\n  <p>{body}</p>\n"
    return f'''<!DOCTYPE html>
<html lang="{lang_code}">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-GMM5Z81M3X"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','G-GMM5Z81M3X')</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{d["title"]} – ShopBG Remover</title>
<meta property="og:locale" content="{og_locale}">
<meta name="description" content="{d["desc"]}">
<link rel="canonical" href="{BASE_URL}{PREFIX[lang_code]}/{slug}">
{hreflang_block(slug)}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS_LEGAL}</style>
</head>
<body>
{nav_html(lang_code, slug, nav_text, sign_in_text, credits_word, change_lang_aria, label_short)}

<div class="container">
  <span class="page-tag">{d["tag"]}</span>
  <h1>{d["h1"]}</h1>
  <p class="meta">{d["meta_date"]}</p>

  <div class="highlight-box">
    <p>{d["highlight"]}</p>
  </div>
{sections_html}
</div>

{footer_html(lang_code, slug, footer_text, change_lang_aria)}

<script>{LANG_JS}</script>
</body>
</html>
'''


# ─── 主循环 ───
if __name__ == "__main__":
    count = 0
    for code, og_locale, label_full, label_short, change_lang_aria, sign_in_text, credits_word in LANGS:
        if code == "en":
            continue  # 跳过英文

        dir_path = ROOT / code.lower().replace("pt-br", "pt-br").replace("BR", "br")
        # PREFIX 映射在 LANG 配置里是 pt-BR；我们目录名是 pt-br
        dir_name = {"es": "es", "pt-BR": "pt-br", "de": "de", "fr": "fr"}[code]
        dir_path = ROOT / dir_name
        dir_path.mkdir(exist_ok=True)

        # contact: 跳过 es（已手写）
        if code != "es":
            (dir_path / "contact.html").write_text(
                render_contact(code, og_locale, label_short, change_lang_aria, sign_in_text, credits_word),
                encoding="utf-8"
            )
            print(f"✓ {dir_name}/contact.html")
            count += 1

        # privacy
        (dir_path / "privacy.html").write_text(
            render_legal(code, og_locale, label_short, change_lang_aria, sign_in_text, credits_word, "privacy", PRIVACY),
            encoding="utf-8"
        )
        print(f"✓ {dir_name}/privacy.html")
        count += 1

        # terms
        (dir_path / "terms.html").write_text(
            render_legal(code, og_locale, label_short, change_lang_aria, sign_in_text, credits_word, "terms", TERMS),
            encoding="utf-8"
        )
        print(f"✓ {dir_name}/terms.html")
        count += 1

    print(f"\n总共生成 {count} 个法务页文件")
