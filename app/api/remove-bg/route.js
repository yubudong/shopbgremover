import { auth } from '../auth/[...nextauth]/route';

export const runtime = 'edge';

// 免费用户每日限额（存在 KV 或简单内存，这里用请求头追踪）
const DAILY_FREE_LIMIT = 3;

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

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const removeFormData = new FormData();
    removeFormData.append('image_file', file);
    removeFormData.append('format', 'png');
    removeFormData.append('type', 'product');
    if (bgColor === 'white') {
      removeFormData.append('bg_color', 'ffffff');
    }

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.REMOVE_BG_API_KEY,
      },
      body: removeFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: 'Remove.bg API failed', detail: errText }, { status: response.status });
    }

    // 扣积分（登录用户）
    if (session?.user?.id && db) {
      await db.prepare(
        'UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?'
      ).bind(session.user.id).run();
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="processed.png"',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
