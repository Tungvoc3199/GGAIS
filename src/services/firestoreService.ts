import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { secureApiPost } from './apiClient';
import {
  Student,
  Instructor,
  Vehicle,
  Lesson,
  Payment,
  AppSettings,
  AuditLog,
  User,
  Availability,
  Reminder
} from '../types';
import firebaseConfig from '../firebase-applet-config.json';

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig
    && firebaseConfig.apiKey
    && !firebaseConfig.apiKey.includes('mock-api-key-replace-me')
  );
};

let cloudReloadScheduled = false;

function scheduleCloudReload(): void {
  if (typeof window === 'undefined' || cloudReloadScheduled) return;
  cloudReloadScheduled = true;
  window.setTimeout(() => window.location.reload(), 150);
}

function handleSecureMutationFailure(label: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label}:`, error);

  if (typeof window !== 'undefined') {
    window.alert(`${label}: ${message}\nDữ liệu sẽ được tải lại từ Cloud để tránh hiển thị sai.`);
    scheduleCloudReload();
  }

  throw error instanceof Error ? error : new Error(message);
}

async function listCollection<T>(collectionName: string): Promise<T[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const results: T[] = [];
    snapshot.forEach(item => results.push(item.data() as T));
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, collectionName);
  }
}

async function writeDocument<T extends { id: string }>(collectionName: string, value: T): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `${collectionName}/${value.id}`;
  try {
    await setDoc(doc(db, collectionName, value.id), value);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function deleteDocument(collectionName: string, id: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- USERS PROFILE ---
export async function getUserProfile(uid: string): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  const path = `users/${uid}`;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? userDoc.data() as User : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserProfile(uid: string, user: User): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), user);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- STUDENTS ---
export async function fetchStudents(): Promise<Student[]> {
  return listCollection<Student>('students');
}

export async function saveStudentDoc(student: Student): Promise<void> {
  return writeDocument('students', student);
}

export async function deleteStudentDoc(id: string): Promise<void> {
  return deleteDocument('students', id);
}

// --- INSTRUCTORS ---
export async function fetchInstructors(): Promise<Instructor[]> {
  return listCollection<Instructor>('instructors');
}

export async function saveInstructorDoc(instructor: Instructor): Promise<void> {
  return writeDocument('instructors', instructor);
}

// --- VEHICLES ---
export async function fetchVehicles(): Promise<Vehicle[]> {
  return listCollection<Vehicle>('vehicles');
}

export async function saveVehicleDoc(vehicle: Vehicle): Promise<void> {
  return writeDocument('vehicles', vehicle);
}

export async function deleteVehicleDoc(id: string): Promise<void> {
  return deleteDocument('vehicles', id);
}

// --- LESSONS ---
export async function fetchLessons(): Promise<Lesson[]> {
  return listCollection<Lesson>('lessons');
}

let autoLessonQueue: Lesson[] = [];
let autoLessonQueueTimer: ReturnType<typeof setTimeout> | null = null;

function isAutoSchedulerLesson(lesson: Lesson): boolean {
  return lesson.status === 'Chờ xác nhận'
    && lesson.notes.includes('Được xếp tự động thông qua Thuật Toán AI');
}

async function flushAutoLessonQueue(): Promise<void> {
  autoLessonQueueTimer = null;
  const lessons = autoLessonQueue;
  autoLessonQueue = [];
  if (!lessons.length) return;

  try {
    const result = await secureApiPost<{ success: boolean; message?: string; conflicts?: unknown[] }>(
      '/api/lessons/batch-confirm',
      { lessons }
    );

    if (!result.success) {
      throw new Error(result.message || 'Server từ chối lưu lịch tự động do có xung đột.');
    }

    scheduleCloudReload();
  } catch (error) {
    handleSecureMutationFailure('Không thể lưu lịch tự động', error);
  }
}

export async function saveLessonDoc(lesson: Lesson): Promise<void> {
  if (!isFirebaseConfigured()) return;

  if (isAutoSchedulerLesson(lesson)) {
    autoLessonQueue.push(lesson);
    if (!autoLessonQueueTimer) {
      autoLessonQueueTimer = setTimeout(() => {
        void flushAutoLessonQueue();
      }, 0);
    }
    return;
  }

  try {
    const result = await secureApiPost<{ success: boolean; message?: string }>('/api/lessons/save', { lesson });
    if (!result.success) throw new Error(result.message || 'Server từ chối lưu ca học.');
    scheduleCloudReload();
  } catch (error) {
    handleSecureMutationFailure('Không thể lưu ca học', error);
  }
}

export async function deleteLessonDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    await secureApiPost('/api/lessons/delete', { lessonId: id });
    scheduleCloudReload();
  } catch (error) {
    handleSecureMutationFailure('Không thể xóa ca học', error);
  }
}

// --- PAYMENTS ---
export async function fetchPayments(): Promise<Payment[]> {
  return listCollection<Payment>('payments');
}

/**
 * Compatibility adapter for existing UI actions.
 * Payment mutations must never write directly to Firestore from the browser.
 */
export async function savePaymentDoc(payment: Payment): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const existingDoc = await getDoc(doc(db, 'payments', payment.id));

    if (!existingDoc.exists()) {
      await secureApiPost('/api/payments/create', {
        id: payment.id,
        studentId: payment.studentId,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        method: payment.method,
        category: payment.category,
        receiver: payment.receiver,
        notes: payment.notes
      });
      scheduleCloudReload();
      return;
    }

    const previous = existingDoc.data() as Payment;

    if (payment.isCancelled && !previous.isCancelled) {
      await secureApiPost('/api/payments/cancel', {
        paymentId: payment.id,
        reason: payment.cancellationReason || 'Hủy phiếu từ giao diện quản lý'
      });
      scheduleCloudReload();
      return;
    }

    if (payment.status === 'Đã duyệt' && previous.status !== 'Đã duyệt') {
      await secureApiPost('/api/payments/approve', {
        paymentId: payment.id
      });
      scheduleCloudReload();
    }
  } catch (error) {
    handleSecureMutationFailure('Không thể đồng bộ phiếu thu', error);
  }
}

// --- AVAILABILITY ---
export async function fetchAvailability(): Promise<Availability[]> {
  return listCollection<Availability>('availability');
}

export async function saveAvailabilityDoc(id: string, availability: Availability): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `availability/${id}`;
  try {
    await setDoc(doc(db, 'availability', id), availability);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- REMINDERS ---
export async function fetchReminders(): Promise<Reminder[]> {
  return listCollection<Reminder>('reminders');
}

export async function saveReminderDoc(reminder: Reminder): Promise<void> {
  return writeDocument('reminders', reminder);
}

// --- AUDIT LOGS ---
export async function fetchAuditLogs(): Promise<AuditLog[]> {
  const results = await listCollection<AuditLog>('auditLogs');
  return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function saveAuditLogDoc(log: AuditLog): Promise<void> {
  return writeDocument('auditLogs', log);
}

// --- CENTRAL SETTINGS ---
export async function getCentralSettings(): Promise<AppSettings | null> {
  if (!isFirebaseConfigured()) return null;
  const path = 'settings/schoolSettings';
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'schoolSettings'));
    return settingsDoc.exists() ? settingsDoc.data() as AppSettings : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCentralSettings(settings: AppSettings): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = 'settings/schoolSettings';
  try {
    await setDoc(doc(db, 'settings', 'schoolSettings'), settings);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
