import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export async function uploadStudentDocument(
  studentId: string,
  kind: 'cccd' | 'eid' | 'avatar',
  file: File | null
): Promise<string> {
  if (!file) return '';
  const fileExtension = file.name.split('.').pop() || 'jpg';
  const fileRef = ref(storage, `students/${studentId}/${kind}.${fileExtension}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}
