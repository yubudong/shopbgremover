import { auth } from '../auth/[...nextauth]/route';

export const runtime = 'edge';

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = req.ctx?.env?.DB;
  if (!db) {
    return Response.json({ error: 'Database not available' }, { status: 500 });
  }

  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
  const { results } = await db.prepare(
    `SELECT id, file_count, created_at, download_url, settings_json
     FROM processing_history
     WHERE user_id = ? AND created_at > ?
     ORDER BY created_at DESC LIMIT 50`
  ).bind(session.user.id, ninetyDaysAgo).all();

  return Response.json(results || []);
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = req.ctx?.env?.DB;
  if (!db) {
    return Response.json({ error: 'Database not available' }, { status: 500 });
  }

  const { file_count, download_url, settings_json } = await req.json();
  const id = crypto.randomUUID();

  await db.prepare(
    'INSERT INTO processing_history (id, user_id, file_count, download_url, settings_json) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, session.user.id, file_count, download_url || null, JSON.stringify(settings_json || {})).run();

  return Response.json({ id });
}
