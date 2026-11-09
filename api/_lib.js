// 공통: 로그인 확인(팀 공용 비밀번호 + 서명 쿠키), Redis 연결, JSON 응답
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

let _redis = null;
export function redis() {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('공유 저장소(Redis) 설정이 없습니다.');
    _redis = new Redis({ url, token, automaticDeserialization: false });
  }
  return _redis;
}

const COOKIE = 'cs_sess';
const DAYS = 30;

// 비밀번호를 바꾸면 서명 키도 바뀌어 기존 로그인이 모두 풀린다.
function signingKey() {
  const s = process.env.SESSION_SECRET, p = process.env.TEAM_PASSWORD;
  if (!s || !p) throw new Error('TEAM_PASSWORD / SESSION_SECRET 환경변수가 없습니다.');
  return s + '\n' + p;
}
const sign = exp => crypto.createHmac('sha256', signingKey()).update('v1.' + exp).digest('base64url');

export function makeCookie() {
  const exp = Date.now() + DAYS * 864e5;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function authed(req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)cs_sess=(\d+)\.([A-Za-z0-9_-]+)/);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > Date.now())) return false;
  try {
    const a = Buffer.from(sign(exp)), b = Buffer.from(m[2]);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

export function checkPassword(pw) {
  const real = process.env.TEAM_PASSWORD;
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
export const deny = () => json({ error: '로그인이 필요합니다.' }, 401);

// 원본 파일 경로: files/<sha256(파일명|크기)>.<확장자>
export const FILE_PATH = /^files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/;
