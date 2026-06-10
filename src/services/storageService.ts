import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from './firebase';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

export type StudentDocumentKind = 'cccd' | 'eid' | 'avatar';

function assertUploadAllowed(file: File): void {
  if (!auth.currentUser) {
    throw new Error('Bạn cần đăng nhập Cloud trước khi tải ảnh lên Storage.');
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ảnh vượt quá giới hạn 4 MB.');
  }
}

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
  file: File
): Promise<string> {
  assertUploadAllowed(file);

  if (!studentId || !/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
    throw new Error('Mã học viên không hợp lệ.');
  }

  const safeFileName = sanitizeFileName(file.name || `${kind}.jpg`);
  const storagePath = `students/${studentId}/${kind}/${Date.now()}_${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      studentId,
      kind,
      uploadedBy: auth.currentUser?.uid || 'unknown'
    }
  });

  return getDownloadURL(storageRef);
}
