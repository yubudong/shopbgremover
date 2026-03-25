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

  const result = await db.prepare(
    'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
  ).bind(session.user.id).first();

  return Response.json(result || { credits: 0, total_used: 0 });
}
