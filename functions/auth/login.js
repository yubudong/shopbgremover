export async function onRequestGet({ env }) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: 'https://www.shopbgremover.com/auth/callback',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}
