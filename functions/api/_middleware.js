export async function onRequest(context) {
  const { request, env, next } = context;

  // OPTIONSリクエスト（preflight）
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(request.url);

  // ログインエンドポイントは認証スキップ
  const isLoginEndpoint = url.pathname === '/api/login';
  if (!isLoginEndpoint) {
    const validToken = env.AUTH_TOKEN;

    // ① セッションCookie（ブラウザ）
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)project_os_session=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    // ② Bearer トークン（cron workerなどサーバー間通信）
    const authHeader = request.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (sessionToken !== validToken && bearerToken !== validToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
}
