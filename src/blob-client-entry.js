// 브라우저용 Vercel Blob 업로드 함수 묶음 (npm run build:blob 으로 blob-client.js 생성)
import { uploadPresigned } from '@vercel/blob/client';
window.BlobClient = { uploadPresigned };
