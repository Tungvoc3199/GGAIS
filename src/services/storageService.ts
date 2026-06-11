import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from './firebase';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

export type StudentDocumentKind = 'cccd' | 'eid' | 'avatar';

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);
}

export async function uploadStudentDocument(
  studentId: string,
  kind: StudentDocumentKind,
  file: File | null
): Promise<string> {
  if (!file) return '';
  if (!auth.currentUser) {
    throw new Error('Bạn cần đăng nhập Cloud trước khi tải ảnh lên.');
  }
  // Standardize file.type or fall back based on file extension
  let contentType = file.type;
  if (contentType === 'image/jpg') {
    contentType = 'image/jpeg';
  }
  if (!contentType && file.name) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'webp') contentType = 'image/webp';
  }
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.');
  }
  if (file.size >= MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ảnh phải nhỏ hơn 4 MB.');
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
    throw new Error('Mã học viên không hợp lệ.');
  }
  const safeName = sanitizeFileName(file.name || `${kind}.jpg`);
  const fileRef = ref(
    storage,
    `students/${studentId}/${kind}/${Date.now()}_${safeName}`
  );
  await uploadBytes(fileRef, file, {
    contentType: contentType
  });
  return getDownloadURL(fileRef);
}
