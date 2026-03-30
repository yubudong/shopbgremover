import { auth } from '../auth/[...nextauth]/route';

export const runtime = 'edge';

const MEITU_API_KEY = process.env.MEITU_API_KEY;
const MEITU_API_SECRET = process.env.MEITU_API_SECRET;

// ── 美图 AK/SK 签名（与 Signer.cs 完全一致）──────────────────
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key, str) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBasicDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

async function meituSign(method, urlStr, body, ak, sk) {
  const u = new URL(urlStr);
  const t = new Date();
  const dateTime = toBasicDate(t);

  const canonicalURI = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';

  const sortedQuery = Array.from(u.searchParams.entries())
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const allHeaders = {
    'content-type': 'application/json',
    'x-sdk-content-sha256': 'UNSIGNED-PAYLOAD',
    'host': u.hostname,
    'x-sdk-date': dateTime,
  };

  const signedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${allHeaders[k]}`).join('\n');
  const signedHeadersStr = signedHeaderKeys.join(';');

  const canonicalRequest = [method.toUpperCase(), canonicalURI, sortedQuery, canonicalHeaders, signedHeadersStr, 'UNSIGNED-PAYLOAD'].join('\n');

  const crHash = await sha256Hex(canonicalRequest);
  const stringToSign = `SDK-HMAC-SHA256\n${dateTime}\n${crHash}`;
  const signature = await hmacSha256Hex(sk, stringToSign);

  const rawAuth = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;
  const authorization = 'Bearer ' + btoa(rawAuth);

  return {
    'Authorization': authorization,
    'X-Sdk-Date': dateTime,
    'X-Sdk-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'Content-Type': 'application/json',
    'Host': u.hostname,
  };
}

// 尺寸预设
const SIZE_PRESETS = {
  shopify: { width: 2048, height: 2048 },
  amazon: { width: 1000, height: 1000 },
  ebay: { width: 500, height: 500 },
  original: null,
};

export async function POST(req) {
  try {
    const session = await auth();
    const db = req.ctx?.env?.DB;

    // 积分检查（登录用户）
    if (session?.user?.id && db) {
      const credits = await db.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(session.user.id).first();

      if (!credits || credits.credits <= 0) {
        return Response.json({ error: 'Insufficient credits. Please upgrade your plan.' }, { status: 402 });
      }
    }

    const formData = await req.formData();
    const file = formData.get('image');
    const bgColor = formData.get('bgColor') || 'white';
    const customColor = formData.get('customColor') || '';

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    // 将图片转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const imageBase64 = btoa(binary);

    const mimeType = file.type || 'image/jpeg';
    const mediaDataType = mimeType.includes('png') ? 'png' : 'jpg';

    // 提交任务
    const pushUrl = 'https://openapi.meitu.com/api/v1/sdk/sync/push';
    const pushBody = JSON.stringify({
      task: '/v1/photo_scissors_oversea/8000555',
      task_type: 'formula',
      parameter: { rsp_media_type: 'png' },
      extra: {},
      media_info_list: [{
        media_data: imageBase64,
        media_profiles: { media_data_type: mediaDataType },
        media_extra: {},
      }],
    });

    const pushHeaders = await meituSign('POST', pushUrl, pushBody, MEITU_API_KEY, MEITU_API_SECRET);
    const pushRes = await fetch(pushUrl, { method: 'POST', headers: pushHeaders, body: pushBody });

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      return Response.json({ error: '美图 API 提交失败', detail: errText }, { status: pushRes.status });
    }

    const pushData = await pushRes.json();
    if (pushData.code && pushData.code !== 0) {
      return Response.json({ error: pushData.message || '美图 API 错误', code: pushData.code }, { status: 502 });
    }

    const taskId = pushData?.data?.task_id || pushData?.task_id;
    if (!taskId) {
      return Response.json({ error: '未获取到 task_id', detail: pushData }, { status: 500 });
    }

    // 轮询查询结果（最多 20 次，间隔 2 秒）
    let resultBase64 = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusUrl = `https://openapi.meitu.com/api/sdk/task/status?task_id=${taskId}`;
      const statusHeaders = await meituSign('GET', statusUrl, '', MEITU_API_KEY, MEITU_API_SECRET);
      const statusRes = await fetch(statusUrl, { headers: statusHeaders });
      const statusData = await statusRes.json();
      const status = statusData?.data?.status || statusData?.status;
      if (status === 'done' || status === 'success' || status === 'finish') {
        const mediaList = statusData?.data?.media_info_list || statusData?.media_info_list;
        resultBase64 = mediaList?.[0]?.media_data;
        break;
      }
      if (status === 'failed' || status === 'error') {
        return Response.json({ error: '美图 API 处理失败', detail: statusData }, { status: 500 });
      }
    }

    if (!resultBase64) {
      return Response.json({ error: '美图 API 超时未返回结果' }, { status: 504 });
    }

    // base64 → ArrayBuffer
    const binStr = atob(resultBase64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    // 扣积分（登录用户，API 成功后才扣）
    if (session?.user?.id && db) {
      await db.prepare(
        'UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?'
      ).bind(session.user.id).run();
    }

    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="processed.png"',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}


// 尺寸预设（美图返回 PNG 后前端自行缩放，此处保留配置供将来使用）
const SIZE_PRESETS = {
  shopify: { width: 2048, height: 2048 },
  amazon: { width: 1000, height: 1000 },
  ebay: { width: 500, height: 500 },
  original: null,
};

export async function POST(req) {
  try {
    const session = await auth();
    const db = req.ctx?.env?.DB;

    // 积分检查（登录用户）
    if (session?.user?.id && db) {
      const credits = await db.prepare(
        'SELECT credits FROM user_credits WHERE user_id = ?'
      ).bind(session.user.id).first();

      if (!credits || credits.credits <= 0) {
        return Response.json({ error: 'Insufficient credits. Please upgrade your plan.' }, { status: 402 });
      }
    }

    const formData = await req.formData();
    const file = formData.get('image');
    const bgColor = formData.get('bgColor') || 'white';
    const customColor = formData.get('customColor') || '';

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    // 将图片转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const imageBase64 = btoa(binary);

    const mimeType = file.type || 'image/jpeg';
    const mediaDataType = mimeType.includes('png') ? 'png' : 'jpg';

    // 第一步：提交异步任务
    const pushRes = await fetch(
      `https://openapi.starii.com/api/v1/sdk/sync/push?api_key=${MEITU_API_KEY}&api_secret=${MEITU_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: '/v1/photo_scissors_oversea/8000555',
          task_type: 'formula',
          parameter: { rsp_media_type: 'png' },
          extra: {},
          media_info_list: [{
            media_data: imageBase64,
            media_profiles: { media_data_type: mediaDataType },
            media_extra: {},
          }],
        }),
      }
    );

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      return Response.json({ error: '美图 API 提交失败', detail: errText }, { status: pushRes.status });
    }

    const pushData = await pushRes.json();
    const taskId = pushData?.data?.task_id || pushData?.task_id;
    if (!taskId) {
      return Response.json({ error: '未获取到 task_id', detail: pushData }, { status: 500 });
    }

    // 第二步：轮询查询结果（最多 20 次，间隔 2 秒）
    let resultBase64 = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://openapi.starii.com/api/sdk/task/status?task_id=${taskId}&api_key=${MEITU_API_KEY}&api_secret=${MEITU_API_SECRET}`
      );
      const statusData = await statusRes.json();
      const status = statusData?.data?.status || statusData?.status;
      if (status === 'done' || status === 'success' || status === 'finish') {
        const mediaList = statusData?.data?.media_info_list || statusData?.media_info_list;
        resultBase64 = mediaList?.[0]?.media_data;
        break;
      }
      if (status === 'failed' || status === 'error') {
        return Response.json({ error: '美图 API 处理失败', detail: statusData }, { status: 500 });
      }
    }

    if (!resultBase64) {
      return Response.json({ error: '美图 API 超时未返回结果' }, { status: 504 });
    }

    // base64 → ArrayBuffer
    const binStr = atob(resultBase64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    // 扣积分（登录用户）
    if (session?.user?.id && db) {
      await db.prepare(
        'UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?'
      ).bind(session.user.id).run();
    }

    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="processed.png"',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

