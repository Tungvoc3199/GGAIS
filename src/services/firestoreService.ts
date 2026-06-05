/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
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

// Utility to check if Firebase project is fully configured instead of placeholder
export const isFirebaseConfigured = (): boolean => {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes('mock-api-key-replace-me')
  );
};

// --- USERS PROFILE ---
export async function getUserProfile(uid: string): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  const path = `users/${uid}`;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createUserProfile(uid: string, user: User): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), user);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- STUDENTS ---
export async function fetchStudents(): Promise<Student[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'students';
  try {
    const snapshot = await getDocs(collection(db, 'students'));
    const results: Student[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Student);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveStudentDoc(student: Student): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `students/${student.id}`;
  try {
    await setDoc(doc(db, 'students', student.id), student);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteStudentDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `students/${id}`;
  try {
    await deleteDoc(doc(db, 'students', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- INSTRUCTORS ---
export async function fetchInstructors(): Promise<Instructor[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'instructors';
  try {
    const snapshot = await getDocs(collection(db, 'instructors'));
    const results: Instructor[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Instructor);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveInstructorDoc(inst: Instructor): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `instructors/${inst.id}`;
  try {
    await setDoc(doc(db, 'instructors', inst.id), inst);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- VEHICLES ---
export async function fetchVehicles(): Promise<Vehicle[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'vehicles';
  try {
    const snapshot = await getDocs(collection(db, 'vehicles'));
    const results: Vehicle[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Vehicle);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveVehicleDoc(vehicle: Vehicle): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `vehicles/${vehicle.id}`;
  try {
    await setDoc(doc(db, 'vehicles', vehicle.id), vehicle);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteVehicleDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `vehicles/${id}`;
  try {
    await deleteDoc(doc(db, 'vehicles', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- LESSONS ---
export async function fetchLessons(): Promise<Lesson[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'lessons';
  try {
    const snapshot = await getDocs(collection(db, 'lessons'));
    const results: Lesson[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Lesson);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveLessonDoc(lesson: Lesson): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `lessons/${lesson.id}`;
  try {
    await setDoc(doc(db, 'lessons', lesson.id), lesson);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteLessonDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `lessons/${id}`;
  try {
    await deleteDoc(doc(db, 'lessons', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- PAYMENTS (Ledger Hardening: ONLY setup add and updates for soft balance cancels, NO hard deletion API) ---
export async function fetchPayments(): Promise<Payment[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'payments';
  try {
    const snapshot = await getDocs(collection(db, 'payments'));
    const results: Payment[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Payment);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePaymentDoc(payment: Payment): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `payments/${payment.id}`;
  try {
    await setDoc(doc(db, 'payments', payment.id), payment);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- AVAILABILITY ---
export async function fetchAvailability(): Promise<Availability[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'availability';
  try {
    const snapshot = await getDocs(collection(db, 'availability'));
    const results: Availability[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Availability);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveAvailabilityDoc(id: string, avail: Availability): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `availability/${id}`;
  try {
    await setDoc(doc(db, 'availability', id), avail);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- REMINDERS ---
export async function fetchReminders(): Promise<Reminder[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'reminders';
  try {
    const snapshot = await getDocs(collection(db, 'reminders'));
    const results: Reminder[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as Reminder);
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveReminderDoc(reminder: Reminder): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `reminders/${reminder.id}`;
  try {
    await setDoc(doc(db, 'reminders', reminder.id), reminder);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- AUDIT LOGS ---
export async function fetchAuditLogs(): Promise<AuditLog[]> {
  if (!isFirebaseConfigured()) return [];
  const path = 'auditLogs';
  try {
    const snapshot = await getDocs(collection(db, 'auditLogs'));
    const results: AuditLog[] = [];
    snapshot.forEach(doc => {
      results.push(doc.data() as AuditLog);
    });
    // Sort descending by timestamp
    return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveAuditLogDoc(log: AuditLog): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = `auditLogs/${log.id}`;
  try {
    await setDoc(doc(db, 'auditLogs', log.id), log);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- CENTRAL SETTINGS ---
export async function getCentralSettings(): Promise<AppSettings | null> {
  if (!isFirebaseConfigured()) return null;
  const path = 'settings/schoolSettings';
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'schoolSettings'));
    if (settingsDoc.exists()) {
      return settingsDoc.data() as AppSettings;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveCentralSettings(settings: AppSettings): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const path = 'settings/schoolSettings';
  try {
    await setDoc(doc(db, 'settings', 'schoolSettings'), settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
