// 팀 공유 데이터 (선박 목록·접수 기록·CSV·PDF 판독값·메모·확인 체크 등)
// - 단일 값: cs:s:<키>  (문자열 그대로)
// - 항목별 값: cs:h:<키> 해시, 필드값 = {"s":저장순번,"v":값}  → 여러 명이 동시에 다른 항목을 고쳐도 서로 덮어쓰지 않는다
// - cs:ver: 바뀔 때마다 1씩 증가 (다른 사람이 고쳤는지 확인용)
import { redis, authed, deny, json } from './_lib.js';

const SCALAR = ['sy.roster', 'sy.alias', 'sy.pend', 'sy.unit'];
const HASH = ['sy.csvs', 'sy.pdfx', 'sy.voy', 'sy.memo', 'sy.done', 'sy.reg'];

export async function GET(req) {
  if (!authed(req)) return deny();
  const r = redis();
  const want = new URL(req.url).searchParams.get('ver');
  if (want != null) {
    const ver = Number((await r.get('cs:ver')) || 0);
    if (String(ver) === want) return json({ ver, same: true });
  }
  const tx = r.multi();
  tx.get('cs:ver');
  SCALAR.forEach(k => tx.get('cs:s:' + k));
  HASH.forEach(k => tx.hgetall('cs:h:' + k));
  const out = await tx.exec();
  const scalars = {}, hashes = {};
  SCALAR.forEach((k, i) => { scalars[k] = out[1 + i] ?? null; });
  // 해시는 [필드, 값, 필드, 값 …] 배열로 올 수 있어 객체로 바꾼다
  const toObj = h => {
    if (!h) return {};
    if (!Array.isArray(h)) return h;
    const o = {};
    for (let i = 0; i + 1 < h.length; i += 2) o[h[i]] = h[i + 1];
    return o;
  };
  HASH.forEach((k, i) => { hashes[k] = toObj(out[1 + SCALAR.length + i]); });
  return json({ ver: Number(out[0] || 0), scalars, hashes });
}

export async function POST(req) {
  if (!authed(req)) return deny();
  let body;
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }
  const ops = Array.isArray(body && body.ops) ? body.ops : [];
  for (const op of ops) {
    if (!op || (!SCALAR.includes(op.k) && !HASH.includes(op.k))) return json({ error: '알 수 없는 항목: ' + (op && op.k) }, 400);
  }
  const r = redis();
  const ver = await r.incr('cs:ver');
  const tx = r.multi();
  let n = 0;
  for (const op of ops) {
    if (SCALAR.includes(op.k)) {
      if (op.val == null) tx.del('cs:s:' + op.k); else tx.set('cs:s:' + op.k, String(op.val));
      n++;
      continue;
    }
    const key = 'cs:h:' + op.k, set = {};
    for (const [f, v] of Object.entries(op.set || {})) {
      if (typeof f !== 'string' || f.length > 2000 || typeof v !== 'string') return json({ error: '잘못된 값입니다.' }, 400);
      try { JSON.parse(v); } catch { return json({ error: '잘못된 값입니다.' }, 400); }
      set[f] = '{"s":' + ver + ',"v":' + v + '}';
    }
    if (Object.keys(set).length) { tx.hset(key, set); n++; }
    const del = (op.del || []).filter(f => typeof f === 'string');
    if (del.length) { tx.hdel(key, ...del); n++; }
  }
  if (n) await tx.exec();
  return json({ ver });
}
