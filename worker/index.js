// Cloudflare Worker - shopbgremover API backend
// Handles: Google OAuth, session, credits, history

// Secrets are injected via Cloudflare Worker environment variables
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, FAL_API_KEY
const REDIRECT_URI = 'https://api.shopbgremover.com/auth/callback';
const FRONTEND_URL = 'https://www.shopbgremover.com';
const FREE_DAILY_LIMIT = 3;

// ── CORS headers ──────────────────────────────────────────────
function cors(origin) {
  // 明确允许的 origin
  const allowedOrigins = [
    'https://www.shopbgremover.com',
    'https://shopbgremover.com',
  ];
  const allowOrigin = allowedOrigins.includes(origin) ? origin : FRONTEND_URL;
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

// ── JWT (simple HMAC-SHA256) ──────────────────────────────────
async function signJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

// ── Auth helper ───────────────────────────────────────────────
async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return verifyJWT(match[1], env.JWT_SECRET);
}

// ── Router ────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, // 有些浏览器不喜欢 204
        headers: { 
          ...cors(origin),
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // GET /auth/login → redirect to Google
    if (url.pathname === '/auth/login') {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
      });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
    }

    // GET /auth/callback → exchange code for token
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code) return Response.redirect(`${FRONTEND_URL}?error=no_code`, 302);

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return Response.redirect(`${FRONTEND_URL}?error=token_failed`, 302);

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();

      // Upsert user
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar`
      ).bind(profile.id, profile.email, profile.name, profile.picture).run();

      // Init credits if new user
      await env.DB.prepare(
        `INSERT OR IGNORE INTO user_credits (user_id, credits) VALUES (?, 5)`
      ).bind(profile.id).run();

      const token = await signJWT(
        { sub: profile.id, email: profile.email, name: profile.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: FRONTEND_URL,
          'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Domain=.shopbgremover.com; Max-Age=2592000`,
        },
      });
    }

    // GET /auth/logout
    if (url.pathname === '/auth/logout') {
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <script>
          document.cookie = 'session=; Path=/; Domain=.shopbgremover.com; Max-Age=0; Secure; SameSite=None';
          document.cookie = 'session=; Path=/; Max-Age=0';
          window.location.href = '${FRONTEND_URL}';
        </script></head><body></body></html>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': 'session=; Path=/; Domain=.shopbgremover.com; Max-Age=0; Secure; SameSite=None',
        },
      });
    }

    // GET /api/me → current user info + credits
    if (url.pathname === '/api/me') {
      const user = await getUser(request, env);
      if (!user) return json({ user: null }, 200, origin);
      const credits = await env.DB.prepare(
        `SELECT credits, total_used FROM user_credits WHERE user_id = ?`
      ).bind(user.sub).first();
      return json({ user: { id: user.sub, email: user.email, name: user.name }, credits }, 200, origin);
    }

    // POST /api/use-credit → deduct 1 credit (or check free quota)
    if (url.pathname === '/api/use-credit' && request.method === 'POST') {
      const user = await getUser(request, env);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const today = new Date().toISOString().slice(0, 10);

      if (!user) {
        // Free quota check
        const row = await env.DB.prepare(
          `SELECT count FROM free_usage WHERE ip = ? AND date = ?`
        ).bind(ip, today).first();
        const count = row?.count || 0;
        if (count >= FREE_DAILY_LIMIT) {
          return json({ ok: false, reason: 'free_limit', message: 'Daily free limit reached. Sign in for more.' }, 403, origin);
        }
        await env.DB.prepare(
          `INSERT INTO free_usage (ip, date, count) VALUES (?, ?, 1)
           ON CONFLICT(ip) DO UPDATE SET count = count + 1, date = ?`
        ).bind(ip, today, today).run();
        return json({ ok: true, remaining: FREE_DAILY_LIMIT - count - 1 }, 200, origin);
      }

      // Paid user: deduct credit
      const credits = await env.DB.prepare(
        `SELECT credits FROM user_credits WHERE user_id = ?`
      ).bind(user.sub).first();
      if (!credits || credits.credits <= 0) {
        return json({ ok: false, reason: 'no_credits', message: 'No credits remaining.' }, 403, origin);
      }
      await env.DB.prepare(
        `UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?`
      ).bind(user.sub).run();
      return json({ ok: true, remaining: credits.credits - 1 }, 200, origin);
    }

    // GET /api/check-credit → 只检查额度，不扣除
    if (url.pathname === '/api/check-credit') {
      const user = await getUser(request, env);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const today = new Date().toISOString().slice(0, 10);
      if (!user) {
        const row = await env.DB.prepare(
          `SELECT count FROM free_usage WHERE ip = ? AND date = ?`
        ).bind(ip, today).first();
        if ((row?.count || 0) >= FREE_DAILY_LIMIT) {
          return json({ ok: false, reason: 'free_limit' }, 200, origin);
        }
        return json({ ok: true }, 200, origin);
      }
      const credits = await env.DB.prepare(
        `SELECT credits FROM user_credits WHERE user_id = ?`
      ).bind(user.sub).first();
      if (!credits || credits.credits <= 0) {
        return json({ ok: false, reason: 'no_credits' }, 200, origin);
      }
      return json({ ok: true, remaining: credits.credits }, 200, origin);
    }

    // POST /api/remove-bg → fal.ai BiRefNet 抠图（成功后才扣积分）
    if (url.pathname === '/api/remove-bg' && request.method === 'POST') {
      const user = await getUser(request, env);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const today = new Date().toISOString().slice(0, 10);

      // 1. 检查额度（不扣除）
      if (!user) {
        const row = await env.DB.prepare(
          `SELECT count FROM free_usage WHERE ip = ? AND date = ?`
        ).bind(ip, today).first();
        if ((row?.count || 0) >= FREE_DAILY_LIMIT) {
          return json({ ok: false, reason: 'free_limit', message: 'Daily free limit reached. Sign in for more.' }, 403, origin);
        }
      } else {
        const credits = await env.DB.prepare(
          `SELECT credits FROM user_credits WHERE user_id = ?`
        ).bind(user.sub).first();
        if (!credits || credits.credits <= 0) {
          return json({ ok: false, reason: 'no_credits', message: 'No credits remaining.' }, 403, origin);
        }
      }

      try {
        const body = await request.json();
        const image_url = body?.image_url;
        if (!image_url) return json({ error: '缺少 image_url' }, 400, origin);

        // 直接调用 fal.ai，前端已压缩好
        const falRes = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${env.FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: image_url,
            model: 'General Use (Heavy)',
            operating_resolution: '1024x1024',
            output_format: 'png',
          }),
        });

        if (!falRes.ok) {
          const txt = await falRes.text();
          return json({ error: 'fal.ai 调用失败', detail: txt }, 502, origin);
        }

        const falData = await falRes.json();
        const resultUrl = falData?.image?.url;
        if (!resultUrl) {
          return json({ error: '未获取到结果图片', detail: falData }, 500, origin);
        }

        // 4. 下载结果图片
        const imgRes = await fetch(resultUrl);
        if (!imgRes.ok) {
          return json({ error: '下载结果图片失败', status: imgRes.status }, 500, origin);
        }

        // 5. 成功后才扣积分
        if (!user) {
          await env.DB.prepare(
            `INSERT INTO free_usage (ip, date, count) VALUES (?, ?, 1)
             ON CONFLICT(ip) DO UPDATE SET count = count + 1, date = ?`
          ).bind(ip, today, today).run();
        } else {
          await env.DB.prepare(
            `UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?`
          ).bind(user.sub).run();
        }

        // 6. 返回图片
        return new Response(imgRes.body, {
          headers: { 'Content-Type': 'image/png', ...cors(origin) },
        });

      } catch (e) {
        return json({ error: '处理失败', message: e.message }, 500, origin);
      }
    }

    // GET /api/history → processing history
    if (url.pathname === '/api/history') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);
      const rows = await env.DB.prepare(
        `SELECT id, file_count, created_at, settings_json FROM processing_history
         WHERE user_id = ? AND created_at > unixepoch() - 7776000
         ORDER BY created_at DESC LIMIT 50`
      ).bind(user.sub).all();
      return json({ history: rows.results }, 200, origin);
    }

    // POST /api/history → save processing record
    if (url.pathname === '/api/history' && request.method === 'POST') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);
      const body = await request.json();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO processing_history (id, user_id, file_count, settings_json) VALUES (?, ?, ?, ?)`
      ).bind(id, user.sub, body.file_count, JSON.stringify(body.settings || {})).run();
      return json({ ok: true, id }, 200, origin);
    }

    // POST /api/paypal/create-order → create PayPal order
    if (url.pathname === '/api/paypal/create-order' && request.method === 'POST') {
      try {
        const user = await getUser(request, env);
        if (!user) return json({ error: 'Unauthorized' }, 401, origin);
        
        const { plan } = await request.json();
        const PLANS = {
          starter: { amount: '9.90', credits: 50 },
          pro: { amount: '19.90', credits: 100 },
          credits_25: { amount: '5.00', credits: 25 },
        };
        
        if (!PLANS[plan]) return json({ error: 'Invalid plan' }, 400, origin);
        
        if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
          return json({ error: 'PayPal credentials not configured' }, 500, origin);
        }
        
        const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
        const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
              amount: { currency_code: 'USD', value: PLANS[plan].amount },
              description: `ShopBG Remover - ${plan}`,
            }],
          }),
        });
        
        const orderText = await orderRes.text();
        let order;
        try {
          order = JSON.parse(orderText);
        } catch(e) {
          return json({ error: 'PayPal API returned invalid JSON', raw: orderText }, 500, origin);
        }
        
        if (!order.id) {
          return json({ error: 'PayPal order creation failed', paypalError: order }, 500, origin);
        }
        
        // Save order to DB
        await env.DB.prepare(
          `INSERT INTO orders (id, user_id, plan, amount, credits, status) VALUES (?, ?, ?, ?, ?, 'pending')`
        ).bind(order.id, user.sub, plan, PLANS[plan].amount, PLANS[plan].credits).run();
        
        return json({ orderId: order.id, approveUrl: order.links.find(l => l.rel === 'approve')?.href }, 200, origin);
      } catch(e) {
        return json({ error: 'Internal server error', message: e.message, stack: e.stack }, 500, origin);
      }
    }

    // POST /api/paypal/capture-order → capture payment and add credits
    if (url.pathname === '/api/paypal/capture-order' && request.method === 'POST') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);

      const { orderId } = await request.json();
      const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);

      // Get order from DB first (to check for duplicate processing)
      const order = await env.DB.prepare(`SELECT plan, credits, status FROM orders WHERE id = ?`).bind(orderId).first();
      if (!order) return json({ error: 'Order not found' }, 404, origin);
      if (order.status === 'completed') return json({ error: 'Order already processed' }, 400, origin);

      const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      });

      const capture = await captureRes.json();

      // Handle already-captured orders (card payments captured instantly)
      const isCompleted = capture.status === 'COMPLETED' ||
        (capture.name === 'UNPROCESSABLE_ENTITY' &&
         capture.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED');

      if (!isCompleted) return json({ error: 'Payment not completed', detail: capture }, 400, origin);

      const credits = order.credits;
      await env.DB.prepare(
        `UPDATE user_credits SET credits = credits + ? WHERE user_id = ?`
      ).bind(credits, user.sub).run();

      await env.DB.prepare(
        `UPDATE orders SET status = 'completed' WHERE id = ?`
      ).bind(orderId).run();

      return json({ ok: true, credits }, 200, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
