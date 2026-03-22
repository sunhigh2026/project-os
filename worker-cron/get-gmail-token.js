/**
 * Gmail OAuth2 Refresh Token 取得スクリプト
 *
 * 使い方:
 * 1. Google Cloud Console → API & Services → Credentials → OAuth 2.0 Client ID を作成（デスクトップアプリ）
 * 2. client_id と client_secret をメモ
 * 3. 以下を実行:
 *    node get-gmail-token.js <client_id> <client_secret>
 * 4. 表示されたURLをブラウザで開いてGoogleアカウントで認証
 * 5. リダイレクト先URLの code=xxx 部分をコピーして貼り付け
 * 6. 表示された refresh_token を wrangler secret put GMAIL_REFRESH_TOKEN で設定
 */

const [,, clientId, clientSecret] = process.argv;

if (!clientId || !clientSecret) {
  console.log('使い方: node get-gmail-token.js <client_id> <client_secret>');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n1. 以下のURLをブラウザで開いてください:\n');
console.log(authUrl);
console.log('\n2. Googleアカウントで認証後、リダイレクトされます。');
console.log('   URLの code=xxx 部分をコピーしてください。\n');

const http = require('http');
const url = require('url');

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/callback' && parsed.query.code) {
    const code = parsed.query.code;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const data = await tokenRes.json();

      if (data.refresh_token) {
        console.log('\n✅ 成功！以下のコマンドでシークレットを設定してください:\n');
        console.log(`cd worker-cron`);
        console.log(`wrangler secret put GMAIL_CLIENT_ID    # 値: ${clientId}`);
        console.log(`wrangler secret put GMAIL_CLIENT_SECRET # 値: ${clientSecret}`);
        console.log(`wrangler secret put GMAIL_REFRESH_TOKEN # 値: ${data.refresh_token}`);
        console.log('\nrefresh_token:', data.refresh_token);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ 認証成功！</h1><p>ターミナルに戻って refresh_token を確認してください。このページは閉じてOKです。</p>');
      } else {
        console.error('❌ refresh_token が取得できませんでした:', data);
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>❌ エラー</h1><pre>' + JSON.stringify(data, null, 2) + '</pre>');
      }
    } catch (e) {
      console.error('❌ エラー:', e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: ' + e.message);
    }

    setTimeout(() => server.close(), 1000);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3000, () => {
  console.log('🔄 ローカルサーバー起動中 (http://localhost:3000/callback)');
  console.log('   ブラウザでの認証を待っています...\n');
});
