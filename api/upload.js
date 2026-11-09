// 원본 파일 업로드: 브라우저가 비공개 Blob 저장소로 직접 올리도록 짧은 유효기간의 서명 URL을 발급한다.
// (서버를 거치면 4.5MB 제한에 걸리므로 직접 업로드)
import { handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { authed, deny, json, FILE_PATH } from './_lib.js';

export async function POST(req) {
  if (!authed(req)) return deny();
  let body;
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }
  // 업로드 URL 발급만 받는다 (업로드 완료 알림 기능은 쓰지 않음)
  if (!body || body.type !== 'blob.generate-presigned-url') return json({ error: '지원하지 않는 요청입니다.' }, 400);
  try {
    const result = await handleUploadPresigned({
      body,
      request: req,
      webhookPublicKey: 'not-used', // 완료 알림을 쓰지 않으므로 검증 키가 필요 없다 (SDK 필수 인자)
      getSignedToken: async pathname => {
        if (!FILE_PATH.test(pathname)) throw new Error('잘못된 파일 경로입니다.');
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          validUntil: Date.now() + 30 * 60 * 1000,
          maximumSizeInBytes: 200 * 1024 * 1024,
        });
        return { token, urlOptions: { allowOverwrite: true } };
      },
    });
    return json(result);
  } catch (e) {
    return json({ error: e.message || String(e) }, 400);
  }
}
