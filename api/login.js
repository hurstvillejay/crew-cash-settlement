import { redis, checkPassword, makeCookie, clearCookie, json, sameOrigin } from './_lib.js';

// 같은 IP에서 10분에 10번까지만 시도할 수 있다.
export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const r = redis();
  const key = 'cs:login:' + ip;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 600);
  if (n > 10) return json({ error: '로그인 시도가 너무 많습니다. 10분 뒤 다시 시도하세요.' }, 429);

  let body = {};
  try { body = await req.json(); } catch {}
  if (!checkPassword(body.password)) return json({ error: '비밀번호가 맞지 않습니다.' }, 401);

  await r.del(key);
  return json({ ok: true }, 200, { 'set-cookie': makeCookie() });
}

// 로그아웃
export async function DELETE() {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie });
}
