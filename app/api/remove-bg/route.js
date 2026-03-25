import { auth } from '../auth/[...nextauth]/route';

export const runtime = 'edge';

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
    const sizePreset = formData.get('sizePreset') || 'original';

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }

    const removeFormData = new FormData();
    removeFormData.append('image_file', file);
    removeFormData.append('format', 'png');
    removeFormData.append('type', 'product');

    // 背景色处理
    if (bgColor === 'custom' && customColor) {
      removeFormData.append('bg_color', customColor.replace('#', ''));
    } else if (bgColor === 'white') {
      removeFormData.append('bg_color', 'ffffff');
    }
    // transparent: 不传 bg_color

    // 尺寸预设
    const size = SIZE_PRESETS[sizePreset];
    if (size) {
      removeFormData.append('size', `${size.width}x${size.height}`);
    }

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': process.env.REMOVE_BG_API_KEY },
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
