import { auth } from '../auth/[...nextauth]/route';

export const runtime = 'edge';

const MEITU_API_KEY = process.env.MEITU_API_KEY;
const MEITU_API_SECRET = process.env.MEITU_API_SECRET;

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

