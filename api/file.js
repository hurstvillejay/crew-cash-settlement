// 원본 파일 보기·삭제 (로그인한 사람만)
// GET ?p=경로        → 10분짜리 서명 URL
// GET ?p=경로&raw=1  → 서버를 거쳐 파일 내용 전달 (서명 URL을 못 쓸 때 대비)
// DELETE ?p=경로     → 삭제
import { issueSignedToken, presignUrl, get, del } from '@vercel/blob';
import { authed, deny, json, FILE_PATH } from './_lib.js';

function pathOf(req) {
  const p = new URL(req.url).searchParams.get('p') || '';
  return FILE_PATH.test(p) ? p : null;
}

export async function GET(req) {
  if (!authed(req)) return deny();
  const p = pathOf(req);
  if (!p) return json({ error: '잘못된 파일 경로입니다.' }, 400);
  try {
    if (new URL(req.url).searchParams.get('raw')) {
      const res = await get(p, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200) return json({ error: '파일이 없습니다.' }, 404);
      return new Response(res.stream, {
        headers: { 'content-type': res.blob.contentType || 'application/octet-stream', 'cache-control': 'private, no-store' },
      });
    }
    const token = await issueSignedToken({ pathname: p, operations: ['get'], validUntil: Date.now() + 10 * 60 * 1000 });
    const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: p, access: 'private', useCache: false });
    return json({ url: presignedUrl });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}

export async function DELETE(req) {
  if (!authed(req)) return deny();
  const p = pathOf(req);
  if (!p) return json({ error: '잘못된 파일 경로입니다.' }, 400);
  try { await del(p); } catch (e) { return json({ error: e.message || String(e) }, 500); }
  return json({ ok: true });
}
