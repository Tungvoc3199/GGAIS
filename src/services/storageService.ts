import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from './firebase';

export type StudentDocumentKind = 'cccd' | 'eid' | 'avatar';

export async function uploadStudentDocument(
  studentId: string,
  kind: StudentDocumentKind,
  file: File
): Promise<string> {
  if (!auth.currentUser) throw new Error('Bạn cần đăng nhập Cloud trước khi tải ảnh lên.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.');
  }
  if (file.size > 4 * 1024 * 1024) throw new Error('Ảnh vượt quá giới hạn 4 MB.');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) throw new Error('Mã học viên không hợp lệ.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const fileRef = ref(storage, `students/${studentId}/${kind}/${Date.now()}_${safeName}`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}
