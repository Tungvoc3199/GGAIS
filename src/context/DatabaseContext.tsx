/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Student,
  Instructor,
  Vehicle,
  Lesson,
  Payment,
  AppSettings,
  AuditLog,
  User,
  UserRole
} from '../types';
import {
  mockStudents,
  mockInstructors,
  mockVehicles,
  mockLessons,
  mockPayments,
  defaultSettings
} from '../mockData';
import { auth, db } from '../services/firebase';
import { runTransaction, doc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  browserSessionPersistence,
  inMemoryPersistence,
  setPersistence
} from 'firebase/auth';
import {
  isFirebaseConfigured,
  getUserProfile,
  fetchStudents,
  saveStudentDoc,
  deleteStudentDoc,
  fetchInstructors,
  saveInstructorDoc,
  fetchVehicles,
  saveVehicleDoc,
  deleteVehicleDoc,
  fetchLessons,
  saveLessonDoc,
  deleteLessonDoc,
  fetchPayments,
  savePaymentDoc,
  fetchAuditLogs,
  saveAuditLogDoc,
  getCentralSettings,
  saveCentralSettings
} from '../services/firestoreService';

const generateUniqueId = (prefix: string): string => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomPart}`;
};

interface DatabaseContextType {
  currentUser: User | null;
  loading: boolean;
  authReady: boolean;
  isSubmittingLogin: boolean;
  dataLoading: boolean;
  students: Student[];
  instructors: Instructor[];
  vehicles: Vehicle[];
  lessons: Lesson[];
  payments: Payment[];
  settings: AppSettings;
  auditLogs: AuditLog[];
  isFirebase: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  toggleDatabaseMode: (preferLocal: boolean) => void;
  // Student Actions
  addStudent: (student: Omit<Student, 'id' | 'code' | 'paidAmount' | 'remainingAmount'>) => void;
  updateStudent: (id: string, updated: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  // Lesson Actions
  addLesson: (lesson: Omit<Lesson, 'id'>) => { success: boolean; error?: string };
  updateLesson: (id: string, updated: Partial<Lesson>) => { success: boolean; error?: string };
  cancelLesson: (id: string, reason: string) => void;
  deleteLesson: (id: string) => void;
  // Payment Actions
  addPayment: (payment: Omit<Payment, 'id' | 'isCancelled' | 'createdAt' | 'createdBy'>) => { success: boolean; error?: string };
  cancelPayment: (id: string, reason: string) => void;
  approvePayment: (id: string) => void;
  // Instructor Actions
  addInstructor: (instructor: Omit<Instructor, 'id'>) => void;
  updateInstructor: (id: string, updated: Partial<Instructor>) => void;
  // Vehicle Actions
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => void;
  updateVehicle: (id: string, updated: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  // Settings Action
  updateSettings: (newSettings: AppSettings) => void;
  addAuditLog: (action: string, details: string) => void;
  resetToDefaultDemo: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const safeAlert = (msg: string) => {
    try {
      if (typeof window !== 'undefined') {
        window.alert(msg);
      }
    } catch (e) {
      console.warn('Alert blocked by browser sandboxing:', msg, e);
    }
  };

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('lhp_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const cached = localStorage.getItem('lhp_settings');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Lỗi phân tích cú pháp lhp_settings lưu trong localStorage:', e);
      }
    }
    return defaultSettings;
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const loading = isSubmittingLogin || dataLoading;

  function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms)
      )
    ]);
  }

  const [preferLocal, setPreferLocal] = useState(() => {
    return localStorage.getItem('lhp_use_local_simulation') === 'true';
  });

  // Check if real Firebase configurations are active
  const isFirebase = isFirebaseConfigured() && !preferLocal;

  const toggleDatabaseMode = (useLocal: boolean) => {
    localStorage.setItem('lhp_use_local_simulation', useLocal ? 'true' : 'false');
    setPreferLocal(useLocal);
    setCurrentUser(null);
    localStorage.removeItem('lhp_user');
  };

  const [authInitialized, setAuthInitialized] = useState(false);

  // Seeder primes function used for Admin reset or auto-hydration
  const runDataSeedingPrimes = async () => {
    try {
      await saveCentralSettings(defaultSettings);

      const studentPromises = mockStudents.map(s => saveStudentDoc(s));
      const instPromises = mockInstructors.map(i => saveInstructorDoc(i));
      const vehPromises = mockVehicles.map(v => saveVehicleDoc(v));
      const lessPromises = mockLessons.map(l => saveLessonDoc(l));
      const payPromises = mockPayments.map(p => savePaymentDoc(p));

      await Promise.all([
        ...studentPromises,
        ...instPromises,
        ...vehPromises,
        ...lessPromises,
        ...payPromises
      ]);

      const startLog: AuditLog = {
        id: 'log_seed_init',
        timestamp: new Date().toISOString(),
        action: 'Khởi tạo Cơ sở Dữ liệu',
        details: 'Dữ liệu mồi chuẩn của trung tâm đào tạo lái xe được thiết lập thành công trên Cloud Firestore.',
        userId: 'system',
        userName: 'Hệ thống LỊCH HỌC PRO',
        userRole: 'Admin'
      };
      await saveAuditLogDoc(startLog);
    } catch (err) {
      console.error('Lỗi nạp mồi dữ liệu:', err);
    }
  };

  const loadFirestoreData = async () => {
    setDataLoading(true);
    try {
      // Safe wrapper to fetch individual tables without failing the entire bootstrap
      const safeFetch = async <T,>(fetchFn: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          const res = await fetchFn();
          return res !== undefined ? res : fallback;
        } catch (err: any) {
          console.warn(`Không có quyền truy cập hoặc lỗi khi tải collection. Đang sử dụng dữ liệu mặc định rỗng:`, err.message || err);
          return fallback;
        }
      };

      // Fetch from Firestore
      const [
        pStudents,
        pInstructors,
        pVehicles,
        pLessons,
        pPayments,
        pLogs,
        pSettings
      ] = await Promise.all([
        safeFetch(fetchStudents, [] as Student[]),
        safeFetch(fetchInstructors, [] as Instructor[]),
        safeFetch(fetchVehicles, [] as Vehicle[]),
        safeFetch(fetchLessons, [] as Lesson[]),
        safeFetch(fetchPayments, [] as Payment[]),
        safeFetch(fetchAuditLogs, [] as AuditLog[]),
        safeFetch(getCentralSettings, null as AppSettings | null)
      ]);

      // Do NOT automatically call runDataSeedingPrimes when Firestore is empty.
      setStudents(pStudents);
      setInstructors(pInstructors);
      setVehicles(pVehicles);
      setLessons(pLessons);
      setPayments(pPayments);
      setAuditLogs(pLogs);
      if (pSettings) setSettings(pSettings);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu từ Firestore, chuyển sang bộ nhớ tạm:', err);
      loadDataFromLocalStorage();
    } finally {
      setDataLoading(false);
    }
  };

  // Auth synchronization for session recovery upon reload
  useEffect(() => {
    if (!isFirebase) {
      loadDataFromLocalStorage();
      setAuthReady(true);
      setAuthInitialized(true);
      return;
    }

    let resolved = false;

    // 5000ms timeout definition
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('Firebase Auth onAuthStateChanged timed out after 5000ms. Falling back to localized local states but allowing future login submissions.');
        loadDataFromLocalStorage();
        setAuthReady(true);
        setAuthInitialized(true);
      }
    }, 5000);

    // Listen to Firebase auth changes
    const unsubscribe = onAuthStateChanged(
      auth,
      async (fbUser) => {
        if (resolved) return;

        try {
          if (!fbUser) {
            if (currentUser) {
              setCurrentUser(null);
              localStorage.removeItem('lhp_user');
            }
            loadDataFromLocalStorage();
            if (!authInitialized) {
              setAuthInitialized(true);
            }
            return;
          }

          if (authInitialized) {
            return;
          }

          // Initial page load session restoration:
          const profile = await getUserProfile(fbUser.uid);
          if (profile) {
            setCurrentUser(profile);
            localStorage.setItem('lhp_user', JSON.stringify(profile));
            // Do not block initial loading, load firestore data in the background
            void loadFirestoreData();
          } else {
            // Untrusted account with no server-managed profile - force signOut and deny access
            await signOut(auth);
            setCurrentUser(null);
            localStorage.removeItem('lhp_user');
            console.warn('Session khôi phục bị từ chối: Tài khoản chưa được biên chế trong cơ sở dữ liệu hệ thống.');
          }
        } catch (err: any) {
          console.error('Lỗi khởi tạo session:', err);
          loadDataFromLocalStorage();
        } finally {
          resolved = true;
          clearTimeout(timer);
          setAuthInitialized(true);
          setAuthReady(true);
        }
      },
      (error) => {
        console.error('onAuthStateChanged error:', error);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          loadDataFromLocalStorage();
          setAuthInitialized(true);
          setAuthReady(true);
        }
      }
    );

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [isFirebase, authInitialized]);

  // Helper helper to load mock sets locally
  const loadDataFromLocalStorage = () => {
    const isMockSeeded = localStorage.getItem('lhp_mock_seeded');
    if (!isMockSeeded) {
      localStorage.setItem('lhp_students', JSON.stringify(mockStudents));
      localStorage.setItem('lhp_instructors', JSON.stringify(mockInstructors));
      localStorage.setItem('lhp_vehicles', JSON.stringify(mockVehicles));
      localStorage.setItem('lhp_lessons', JSON.stringify(mockLessons));
      localStorage.setItem('lhp_payments', JSON.stringify(mockPayments));
      localStorage.setItem('lhp_mock_seeded', 'true');
    }

    const sStudents = localStorage.getItem('lhp_students');
    setStudents(sStudents ? JSON.parse(sStudents) : []);

    const sInstructors = localStorage.getItem('lhp_instructors');
    setInstructors(sInstructors ? JSON.parse(sInstructors) : []);

    const sVehicles = localStorage.getItem('lhp_vehicles');
    setVehicles(sVehicles ? JSON.parse(sVehicles) : []);

    const sLessons = localStorage.getItem('lhp_lessons');
    setLessons(sLessons ? JSON.parse(sLessons) : []);

    const sPayments = localStorage.getItem('lhp_payments');
    setPayments(sPayments ? JSON.parse(sPayments) : []);

    const sSettings = localStorage.getItem('lhp_settings');
    setSettings(sSettings ? JSON.parse(sSettings) : defaultSettings);

    const sLogs = localStorage.getItem('lhp_audit_logs');
    setAuditLogs(sLogs ? JSON.parse(sLogs) : [
      {
        id: 'log_init',
        timestamp: new Date().toISOString(),
        action: 'Khởi tạo hệ thống offline',
        details: 'Hệ thống chạy ngoại tuyến. Số liệu mẫu được tải thành công từ bộ nhớ LocalStorage.',
        userId: 'system',
        userName: 'Hệ thống LỊCH HỌC PRO',
        userRole: 'Admin'
      }
    ]);
  };

  // Keep local storage synchronized for fallback
  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_students', JSON.stringify(students));
    }
  }, [students, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_instructors', JSON.stringify(instructors));
    }
  }, [instructors, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_lessons', JSON.stringify(lessons));
    }
  }, [lessons, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_payments', JSON.stringify(payments));
    }
  }, [payments, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_settings', JSON.stringify(settings));
    }
  }, [settings, authInitialized]);

  useEffect(() => {
    if (authInitialized) {
      localStorage.setItem('lhp_audit_logs', JSON.stringify(auditLogs));
    }
  }, [auditLogs, authInitialized]);


  // Logging action helper
  const addAuditLog = async (action: string, details: string) => {
    const newLog: AuditLog = {
      id: generateUniqueId('log'),
      timestamp: new Date().toISOString(),
      action,
      details,
      userId: currentUser?.uid || 'guest',
      userName: currentUser?.displayName || 'Khách vãng lai',
      userRole: currentUser?.role || 'Staff'
    };

    setAuditLogs(prev => [newLog, ...prev]);

    if (isFirebase) {
      try {
        await saveAuditLogDoc(newLog);
      } catch (err) {
        console.error('Lỗi khi ghi nhật ký Firestore:', err);
      }
    }
  };

  // Real or Local Simulation Authentication
  const login = async (email: string, password = 'DefaultPassword123'): Promise<boolean> => {
    setIsSubmittingLogin(true);
    try {
      if (isFirebase) {
        // Try setPersistence with browserSessionPersistence under a 3000ms timeout
        try {
          await withTimeout(
            setPersistence(auth, browserSessionPersistence),
            3000,
            'browserSessionPersistence timed out'
          );
        } catch (persError) {
          console.warn('browserSessionPersistence failed or timed out in preview environment, falling back to inMemoryPersistence:', persError);
          try {
            await setPersistence(auth, inMemoryPersistence);
          } catch (memError) {
            console.error('Failed to set inMemoryPersistence:', memError);
          }
        }

        // Attempt sign in with 10000ms timeout
        let userCredential;
        try {
          userCredential = await withTimeout(
            signInWithEmailAndPassword(auth, email.trim(), password),
            10000,
            'Đăng nhập Firebase Auth quá hạn (10 giây). Vui lòng thử lại.'
          );
        } catch (authError: any) {
          if (
            authError.code === 'auth/user-not-found' ||
            authError.code === 'auth/invalid-credential' ||
            authError.code === 'auth/wrong-password' ||
            authError.message?.includes('invalid-credential') ||
            authError.message?.includes('wrong-password')
          ) {
            throw new Error('Đăng nhập thất bại: Tài khoản hoặc mật khẩu không chính xác.');
          } else {
            throw authError;
          }
        }

        const fbUser = userCredential.user;

        // Try getUserProfile with 10000ms timeout
        let profile;
        try {
          profile = await withTimeout(
            getUserProfile(fbUser.uid),
            10000,
            'Tải cấu hình người dùng (Firestore profile) quá hạn (10 giây).'
          );
        } catch (profileError: any) {
          console.error('Error fetching getUserProfile:', profileError);
          throw new Error('Lỗi truy xuất cơ sở dữ liệu hồ sơ: ' + (profileError.message || String(profileError)));
        }

        if (!profile) {
          // Deny login, clear credentials
          await signOut(auth);
          throw new Error('Tài khoản chưa được cấp quyền sử dụng hệ thống. Vui lòng liên hệ Admin.');
        }

        setCurrentUser(profile);
        localStorage.setItem('lhp_user', JSON.stringify(profile));

        // Load Live Firestore Data in background (Do NOT await loadFirestoreData before returning true)
        void loadFirestoreData();

        await addAuditLog('Đăng nhập', `Đăng nhập thành công với tài khoản Cloud Auth (${profile.role}).`);
        return true;
      } else {
        // Simulation Login
        await new Promise(resolve => setTimeout(resolve, 350));
        const lowerEmail = email.toLowerCase().trim();
        let localRole: UserRole = 'Staff';
        if (lowerEmail === 'admin@lichhocpro.vn' || lowerEmail === 'admin') {
          localRole = 'Admin';
        } else if (lowerEmail === 'hung.nv@lichhocpro.vn' || lowerEmail === 'teacher' || lowerEmail === 'instructor') {
          localRole = 'Instructor';
        } else if (lowerEmail === 'thao.staff@lichhocpro.vn' || lowerEmail === 'staff') {
          localRole = 'Staff';
        } else if (lowerEmail === 'linh.sale@lichhocpro.vn' || lowerEmail === 'sale') {
          localRole = 'Staff';
        } else if (lowerEmail === 'accountant@lichhocpro.vn' || lowerEmail === 'accountant') {
          localRole = 'Accountant';
        }

        let uName = email.split('@')[0].toUpperCase();
        const mockUser: User = {
          uid: generateUniqueId('u'),
          email,
          displayName: uName === 'ADMIN' ? 'Nguyễn Anh Dương' : uName === 'HUNG.NV' ? 'Thầy Hùng' : 'Mỹ Linh (Tuyển Sinh)',
          role: localRole
        };
        setCurrentUser(mockUser);
        localStorage.setItem('lhp_user', JSON.stringify(mockUser));

        const logNewLog: AuditLog = {
          id: generateUniqueId('log'),
          timestamp: new Date().toISOString(),
          action: 'Đăng nhập',
          details: `Đăng nhập thành công offline với vai trò mẫu ${localRole}.`,
          userId: mockUser.uid,
          userName: mockUser.displayName,
          userRole: localRole
        };
        setAuditLogs(prev => [logNewLog, ...prev]);
        return true;
      }
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const logout = async () => {
    await addAuditLog('Đăng xuất', `Tài khoản ${currentUser?.displayName} đã thoát khỏi hệ thống.`);
    if (isFirebase) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('Lỗi đăng xuất auth:', err);
      }
    }
    setCurrentUser(null);
    localStorage.removeItem('lhp_user');
  };

  // Forced seeder trigger from settings panel
  const resetToDefaultDemo = async () => {
    if (currentUser?.role !== 'Admin') {
      safeAlert('Chỉ tài khoản quản trị tối cao (Admin) mới có quyền khởi tạo lại dữ liệu trường đào tạo.');
      return;
    }

    setDataLoading(true);
    await addAuditLog('Khôi phục dữ liệu', 'Bắt đầu quá trình nén và mồi phục dọn dữ liệu mẫu từ quản trị viên.');

    if (isFirebase) {
      try {
        await runDataSeedingPrimes();
        // Force refetch
        const rStudents = await fetchStudents();
        const rInstructors = await fetchInstructors();
        const rVehicles = await fetchVehicles();
        const rLessons = await fetchLessons();
        const rPayments = await fetchPayments();
        const rLogs = await fetchAuditLogs();
        const rSettings = await getCentralSettings();

        setStudents(rStudents);
        setInstructors(rInstructors);
        setVehicles(rVehicles);
        setLessons(rLessons);
        setPayments(rPayments);
        setAuditLogs(rLogs);
        if (rSettings) setSettings(rSettings);

        safeAlert('Đã đồng bộ mồi dữ liệu chuẩn trên Cloud thành công!');
      } catch (err: any) {
        safeAlert(`Thất bại khi mồi dữ liệu trên cloud: ${err.message}`);
      }
    } else {
      setStudents(mockStudents);
      setInstructors(mockInstructors);
      setVehicles(mockVehicles);
      setLessons(mockLessons);
      setPayments(mockPayments);
      setSettings(defaultSettings);
      setAuditLogs([
        {
          id: generateUniqueId('log'),
          timestamp: new Date().toISOString(),
          action: 'Thiết lập lại ngoại tuyến',
          details: 'Dữ liệu ngoại tuyến được trả về trạng thái mặc định của nhà sản xuất.',
          userId: currentUser.uid,
          userName: currentUser.displayName,
          userRole: 'Admin'
        }
      ]);
      safeAlert('Đã hoàn phục cơ sở dữ liệu mô phỏng trong LocalStorage.');
    }
    setDataLoading(false);
  };

  // --- STUDENT ACTIONS ---
  const addStudent = async (newS: Omit<Student, 'id' | 'code' | 'paidAmount' | 'remainingAmount'>) => {
    const yy = new Date().getFullYear().toString().slice(-2);
    let code = `HV-${yy}-0001`;
    const id = generateUniqueId('stud');

    if (isFirebase) {
      try {
        const counterRef = doc(db, 'settings', 'studentCounter');
        
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let nextNum = 1;
          if (counterDoc.exists()) {
            nextNum = (counterDoc.data().nextCodeNo || 1);
          }
          code = `HV-${yy}-${String(nextNum).padStart(4, '0')}`;
          
          // Increment transaction counter
          transaction.set(counterRef, { nextCodeNo: nextNum + 1 }, { merge: true });

          const freshStudent: Student = {
            ...newS,
            id,
            code,
            paidAmount: 0,
            remainingAmount: newS.totalFee,
            completedSessions: 0,
            remainingSessions: newS.totalSessions
          };

          const studentDocRef = doc(db, 'students', id);
          transaction.set(studentDocRef, freshStudent);
        });

        // Refetch newest states from Firestore
        await loadFirestoreData();
      } catch (err: any) {
        console.error('Lỗi khi đăng ký học viên (Firestore Transaction):', err);
        throw err;
      }
    } else {
      // Local Simulation Sequence Formula: max suffix + 1
      const maxNum = students.reduce((acc, curr) => {
        const parts = curr.code.split('-');
        const parsed = Number(parts[parts.length - 1]);
        return (!isNaN(parsed) && parsed > acc) ? parsed : acc;
      }, 0);
      const nextNum = maxNum + 1;
      code = `HV-${yy}-${String(nextNum).padStart(4, '0')}`;

      const freshStudent: Student = {
        ...newS,
        id,
        code,
        paidAmount: 0,
        remainingAmount: newS.totalFee,
        completedSessions: 0,
        remainingSessions: newS.totalSessions
      };

      setStudents(prev => [freshStudent, ...prev]);
    }

    await addAuditLog('Thêm học viên mới', `Đăng ký thành công học viên: ${newS.name} (${code}) khóa học ${newS.courseType}.`);
  };

  const updateStudent = async (id: string, updated: Partial<Student>) => {
    let mergedStudent: Student | undefined;

    setStudents(prev => prev.map(s => {
      if (s.id === id) {
        const after = { ...s, ...updated };
        after.remainingAmount = Math.max(0, after.totalFee - after.paidAmount);
        after.remainingSessions = Math.max(0, after.totalSessions - after.completedSessions);
        mergedStudent = after;
        return after;
      }
      return s;
    }));

    if (isFirebase) {
      setTimeout(async () => {
        if (mergedStudent) {
          try {
            await saveStudentDoc(mergedStudent);
          } catch (err) {
            console.error('Lỗi updateStudent Firestore:', err);
          }
        }
      }, 0);
    }

    const sName = mergedStudent?.name || id;
    await addAuditLog('Sửa hồ sơ học viên', `Chỉnh sửa thông tin cốt lõi của học viên ${sName}. Các trường tác động: ${Object.keys(updated).join(', ')}.`);
  };

  const deleteStudent = async (id: string) => {
    if (currentUser?.role !== 'Admin') {
      safeAlert('Chỉ quản trị tối cao mới có đặc quyền xóa hoàn toàn hồ sơ học viên.');
      return;
    }

    const sObj = students.find(s => s.id === id);
    setStudents(prev => prev.filter(s => s.id !== id));

    if (isFirebase) {
      try {
        await deleteStudentDoc(id);
      } catch (err) {
        console.error('Lỗi xóa học viên trong Firestore:', err);
      }
    }

    await addAuditLog('Xóa học viên', `Đã xóa học viên ${sObj?.name || id} ra khỏi hồ sơ lưu trữ chính.`);
  };

  // --- LESSON ACTIONS ---
  const addLesson = (newL: Omit<Lesson, 'id'>) => {
    const id = generateUniqueId('less');
    const freshLesson: Lesson = {
      id,
      ...newL
    };

    setLessons(prev => [freshLesson, ...prev]);

    if (isFirebase) {
      saveLessonDoc(freshLesson).catch(err => console.error('Lỗi tạo mới Lesson:', err));
    }

    const sObj = students.find(s => s.id === newL.studentId);
    
    // Check if the lesson overrides normal business hours
    const [startH, startM] = newL.startTime.split(':').map(Number);
    const [workH, workM] = settings.workingHours.start.split(':').map(Number);
    const [endH, endM] = settings.workingHours.end.split(':').map(Number);
    
    const startVal = startH * 60 + startM;
    const workVal = workH * 60 + workM;
    const endVal = endH * 60 + endM;
    
    const isOverride = startVal < workVal || startVal > endVal;
    
    if (isOverride) {
      addAuditLog(
        'Ghi đè ca dạy (Schedule Override)', 
        `Cảnh báo: Đã xếp lịch biểu ngoài giờ hành chính (Lúc ${newL.startTime} ngày ${newL.date}) cho học viên ${sObj?.name || newL.studentId} của giảng viên ID ${newL.instructorId}.`
      );
    } else {
      addAuditLog('Xếp lịch học', `Xếp lịch học thực tế ngày ${newL.date} từ ${newL.startTime} cho ${sObj?.name || newL.studentId}.`);
    }

    return { success: true };
  };

  const updateLesson = (id: string, updated: Partial<Lesson>) => {
    let oldLess: Lesson | undefined;

    setLessons(prev => prev.map(les => {
      if (les.id === id) {
        oldLess = les;
        return { ...les, ...updated };
      }
      return les;
    }));

    setTimeout(async () => {
      const fullDoc = lessons.find(l => l.id === id);
      if (fullDoc && isFirebase) {
        try {
          await saveLessonDoc({ ...fullDoc, ...updated });
        } catch (err) {
          console.error('Lỗi khi cập nhật Lesson Firestore:', err);
        }
      }
    }, 100);

    // If marked as completed, update student sessions count
    if (updated.status === 'Đã hoàn thành' && oldLess?.status !== 'Đã hoàn thành') {
      const studentId = oldLess?.studentId || updated.studentId;
      if (studentId) {
        updateStudentSessionsCompleted(studentId);
      }
    }

    // Checking for schedule reschedule logs
    if (updated.date || updated.startTime) {
      addAuditLog('Ghi đè lịch học', `Thay đổi lịch hẹn ID: ${id} sang thời gian mới: ${updated.date || oldLess?.date} lúc ${updated.startTime || oldLess?.startTime}.`);
    } else {
      addAuditLog('Cập nhật trạng thái dạy', `Sửa trạng thái ca dạy ID ${id} thành ${updated.status || 'Có mặt'}.`);
    }

    return { success: true };
  };

  const updateStudentSessionsCompleted = (studentId: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        const completed = Math.min(s.totalSessions, s.completedSessions + 1);
        const updatedStudent = {
          ...s,
          completedSessions: completed,
          remainingSessions: s.totalSessions - completed
        };
        if (isFirebase) {
          saveStudentDoc(updatedStudent).catch(err => console.error(err));
        }
        return updatedStudent;
      }
      return s;
    }));
  };

  const cancelLesson = (id: string, reason: string) => {
    updateLesson(id, { status: 'Hủy lịch', resultNote: `Hủy lịch: ${reason}` });
    addAuditLog('Hủy lịch ca tập', `Hủy ca học có ID ${id} với nguyên do: ${reason}`);
  };

  const deleteLesson = async (id: string) => {
    if (currentUser?.role === 'Instructor') {
      safeAlert('Giảng viên không có thẩm quyền loại bỏ hoặc xóa vĩnh viễn sự kiện ca dạy khỏi sổ cái.');
      return;
    }

    setLessons(prev => prev.filter(l => l.id !== id));

    if (isFirebase) {
      try {
        await deleteLessonDoc(id);
      } catch (err) {
        console.error('Lỗi Firestore deleteLesson:', err);
      }
    }

    await addAuditLog('Xóa lịch học', `Xóa hẳn sự kiện lịch học mã ID: ${id}.`);
  };

  // --- PAYMENT ACTIONS (Ledger Hardening enforces payments CANNOT be deleted, only soft-cancelled) ---
  const addPayment = (newP: Omit<Payment, 'id' | 'isCancelled' | 'createdAt' | 'createdBy'>) => {
    const student = students.find(s => s.id === newP.studentId);
    if (!student) {
      return { success: false, error: 'Không tìm thấy thông tin đăng ký của học viên này để đối soát thanh toán.' };
    }

    const payId = generateUniqueId('pay');
    const freshPayment: Payment = {
      ...newP,
      id: payId,
      isCancelled: false,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.email || 'system@lichhocpro.vn'
    };

    setPayments(prev => [freshPayment, ...prev]);

    // Async push of payment ledger and student balances updates
    if (isFirebase) {
      savePaymentDoc(freshPayment).catch(err => console.error('Lỗi khi chèn Payment:', err));
    }

    if (newP.status !== 'Chờ duyệt') {
      setStudents(prev => prev.map(s => {
        if (s.id === newP.studentId) {
          const newPaid = s.paidAmount + newP.amount;
          const newRemaining = Math.max(0, s.totalFee - newPaid);
          const updatedStudent = {
            ...s,
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            reminderStatus: 'Chưa nhắc' as any
          };
          if (isFirebase) {
            saveStudentDoc(updatedStudent).catch(err => console.error(err));
          }
          return updatedStudent;
        }
        return s;
      }));
    }

    addAuditLog('Thu học phí', `Ghi nhận thu tiền từ HV ${student.name}: +${newP.amount.toLocaleString('vi-VN')} đ cho mục ${newP.category} (${newP.status || 'Đã duyệt'}).`);
    return { success: true };
  };

  const approvePayment = (id: string) => {
    let affectedPayment: Payment | undefined;
    setPayments(prev => prev.map(p => {
      if (p.id === id) {
        affectedPayment = p;
        return { ...p, status: 'Đã duyệt' };
      }
      return p;
    }));

    setTimeout(() => {
      if (affectedPayment) {
        const p = affectedPayment;
        if (isFirebase) {
          savePaymentDoc({ ...p, status: 'Đã duyệt' }).catch(err => console.error(err));
        }
        setStudents(prev => prev.map(s => {
          if (s.id === p.studentId) {
            const newPaid = s.paidAmount + p.amount;
            const newRemaining = Math.max(0, s.totalFee - newPaid);
            const updatedStudent = {
              ...s,
              paidAmount: newPaid,
              remainingAmount: newRemaining
            };
            if (isFirebase) {
              saveStudentDoc(updatedStudent).catch(err => console.error(err));
            }
            return updatedStudent;
          }
          return s;
        }));
        addAuditLog('Duyệt học phí', `Đã xác nhận & duyệt biên lai ID ${p.id} số tiền ${p.amount.toLocaleString('vi-VN')} đ.`);
      }
    }, 100);
  };

  const cancelPayment = (id: string, reason: string) => {
    if (currentUser?.role === 'Staff') {
      safeAlert('Cố gắng từ chối: Giáo vụ tuyển sinh không được phép hủy chứng từ doanh thu.');
      return;
    }

    let pObj: Payment | undefined;
    setPayments(prev => prev.map(p => {
      if (p.id === id) {
        pObj = p;
        return { ...p, isCancelled: true, cancellationReason: reason };
      }
      return p;
    }));

    if (pObj) {
      const targetPay = pObj;
      if (isFirebase) {
        savePaymentDoc({ ...targetPay, isCancelled: true, cancellationReason: reason }).catch(err => console.error(err));
      }

      // Reverse paid amounts
      setStudents(prev => prev.map(s => {
        if (s.id === targetPay.studentId) {
          const revPaid = Math.max(0, s.paidAmount - targetPay.amount);
          const updatedStudent = {
            ...s,
            paidAmount: revPaid,
            remainingAmount: Math.max(0, s.totalFee - revPaid)
          };
          if (isFirebase) {
            saveStudentDoc(updatedStudent).catch(err => console.error(err));
          }
          return updatedStudent;
        }
        return s;
      }));

      // Audit logs for payment cancellation
      addAuditLog(
        'Hủy Biên Lai Doanh Thu (Payment Cancelled)', 
        `Hủy thanh toán ID ${id} của HV ID ${targetPay.studentId}. Số tiền chênh hoàn: -${targetPay.amount.toLocaleString('vi-VN')} đ. Lý do: ${reason}.`
      );
    }
  };

  // --- INSTRUCTOR ACTIONS ---
  const addInstructor = async (ins: Omit<Instructor, 'id'>) => {
    const freshIns: Instructor = {
      id: generateUniqueId('inst'),
      ...ins
    };

    setInstructors(prev => [...prev, freshIns]);

    if (isFirebase) {
      try {
        await saveInstructorDoc(freshIns);
      } catch (err) {
        console.error('Lỗi khi chèn Instructor:', err);
      }
    }

    await addAuditLog('Thêm giảng viên', `Tuyển dụng thành viên dạy lái xe mới: Đã biên chế thầy ${freshIns.name}.`);
  };

  const updateInstructor = async (id: string, updated: Partial<Instructor>) => {
    let mergedIns: Instructor | undefined;

    setInstructors(prev => prev.map(i => {
      if (i.id === id) {
        mergedIns = { ...i, ...updated };
        return mergedIns;
      }
      return i;
    }));

    if (isFirebase) {
      setTimeout(async () => {
        if (mergedIns) {
          try {
            await saveInstructorDoc(mergedIns);
          } catch (err) {
            console.error('Lỗi updateInstructor Firestore:', err);
          }
        }
      }, 0);
    }

    const insName = mergedIns?.name || id;
    await addAuditLog('Sửa giảng viên', `Thay đổi thông tin hành chính của Thầy ${insName}.`);
  };

  // --- VEHICLE ACTIONS ---
  const addVehicle = async (veh: Omit<Vehicle, 'id'>) => {
    const freshV: Vehicle = {
      id: generateUniqueId('veh'),
      code: `XE-26-${Math.floor(1000 + Math.random() * 9000)}`,
      ...veh
    };

    setVehicles(prev => [...prev, freshV]);

    if (isFirebase) {
      try {
        await saveVehicleDoc(freshV);
      } catch (err) {
        console.error('Lỗi thêm Vehicle:', err);
      }
    }

    await addAuditLog('Thêm xe tập mới', `Cấp biển số tập cho xe mới: ${freshV.name} - ${freshV.plate}.`);
  };

  const updateVehicle = async (id: string, updated: Partial<Vehicle>) => {
    let mergedVeh: Vehicle | undefined;

    setVehicles(prev => prev.map(v => {
      if (v.id === id) {
        mergedVeh = { ...v, ...updated };
        return mergedVeh;
      }
      return v;
    }));

    if (isFirebase) {
      setTimeout(async () => {
        if (mergedVeh) {
          try {
            await saveVehicleDoc(mergedVeh);
          } catch (err) {
            console.error('Lỗi updateVehicle Firestore:', err);
          }
        }
      }, 0);
    }

    const vehName = mergedVeh?.name || id;
    await addAuditLog('Bảo dưỡng / Sửa trạng thái xe', `Cập nhật hồ sơ vận hành của xe tập lái ${vehName}.`);
  };

  const deleteVehicle = async (id: string) => {
    if (currentUser?.role === 'Instructor') {
      safeAlert('Giảng viên không có thẩm quyền xóa xe khỏi hệ thống.');
      return;
    }

    const name = vehicles.find(v => v.id === id)?.name || id;
    setVehicles(prev => prev.filter(v => v.id !== id));

    if (isFirebase) {
      try {
        await deleteVehicleDoc(id);
      } catch (err) {
        console.error('Lỗi Firestore deleteVehicle:', err);
      }
    }

    await addAuditLog('Xóa xe tập', `Xóa hẳn xe tập lái: ${name} (ID: ${id}) khỏi hệ thống.`);
  };

  // --- CENTRAL SETTINGS ACTIONS ---
  const updateSettings = async (newS: AppSettings) => {
    setSettings(newS);

    if (isFirebase) {
      try {
        await saveCentralSettings(newS);
      } catch (err) {
        console.error('Lỗi lưu Settings:', err);
      }
    }

    await addAuditLog('Sửa cấu hình hệ thống', `Thay đổi các thuộc tính trung tâm của cơ sở ${newS.schoolName}.`);
  };

  return (
    <DatabaseContext.Provider
      value={{
        currentUser,
        loading,
        authReady,
        isSubmittingLogin,
        dataLoading,
        students,
        instructors,
        vehicles,
        lessons,
        payments,
        settings,
        auditLogs,
        isFirebase,
        login,
        logout,
        toggleDatabaseMode,
        addStudent,
        updateStudent,
        deleteStudent,
        addLesson,
        updateLesson,
        cancelLesson,
        deleteLesson,
        addPayment,
        cancelPayment,
        approvePayment,
        addInstructor,
        updateInstructor,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        updateSettings,
        addAuditLog,
        resetToDefaultDemo
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};
