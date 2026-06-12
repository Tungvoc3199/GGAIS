/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Admin' | 'Instructor' | 'Staff' | 'Accountant';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export type LicenseClass = 'A1' | 'A' | 'B số tự động' | 'B số sàn' | 'C1';

export type StudentStatus = 'Danh sách chờ' | 'Mới đăng ký' | 'Đang học' | 'Tạm dừng' | 'Đã hoàn thành' | 'Đã thi';

export interface Student {
  id: string; // Mã ID / Firestore Document ID
  code: string; // Mã học viên (e.g. HV-2026-0001)
  name: string;
  phone: string;
  dob: string; // yyyy-MM-dd
  address: string;
  licenseClass: LicenseClass;
  courseType: string;
  registrationDate: string; // yyyy-MM-dd
  totalFee: number;
  paidAmount: number;
  remainingAmount: number;
  nextPaymentDeadline: string; // yyyy-MM-dd
  status: StudentStatus;
  totalSessions: number;
  completedSessions: number;
  remainingSessions: number;
  assignedInstructorId: string;
  assignedVehicleId: string;
  notes: string;
  reminderStatus: 'Chưa nhắc' | 'Đã nhắc' | 'Đã hẹn ngày thanh toán';
  tags?: string[];
  cccdImage?: string;
  avatarImage?: string;
  eidImage?: string;
  cccdStoragePath?: string;
  eidStoragePath?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  theoryCompleted?: boolean;
  simulationCompleted?: boolean;
}

export interface Instructor {
  id: string;
  name: string;
  phone: string;
  vehicleTypes: string[]; // e.g. ["A1", "A", "B số tự động", "B số sàn", "C1"]
  workingDays: number[]; // Array of weekdays normalized (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  workingHours: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  daysOff: string[]; // ISO Dates of exceptional holidays (e.g., ["2026-06-15"])
  active: boolean;
  notes: string;
  code?: string;
  teachingCertificate?: string;
  experienceYears?: number;
  status?: 'Đang dạy' | 'Tạm nghỉ' | 'Nghỉ việc';
}

export type VehicleStatus = 'Sẵn sàng' | 'Đang sử dụng' | 'Bảo dưỡng' | 'Tạm ngưng';

export interface VehicleExpense {
  id: string;
  date: string; // yyyy-MM-dd
  category: 'Xăng xe' | 'Bảo dưỡng' | 'Đăng kiểm' | 'Chi phí khác';
  amount: number;
  notes: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  transmission: 'Số tự động' | 'Số sàn';
  category: string; // e.g. "Toyota Vios 2023", "Suzuki Carry"
  status: VehicleStatus;
  notes: string;
  code?: string;
  suitableLicenseClass?: string;
  currentMileage?: number;
  nextOilChangeMileage?: number;
  nextOilChangeDate?: string;
  lastMaintenanceDate?: string;
  maintenanceNotes?: string;
  expenses?: VehicleExpense[];
}

export type LessonStatus = 'Chờ xác nhận' | 'Đã xác nhận' | 'Đã hoàn thành' | 'Học viên báo nghỉ' | 'Giảng viên báo nghỉ' | 'Hủy lịch';
export type AttendanceStatus = 'Chưa điểm danh' | 'Có mặt' | 'Vắng';
export type LessonType = 'Làm quen xe' | 'Đường trường cơ bản' | 'Đường trường nâng cao' | 'Sa hình' | 'Bổ túc tay lái' | 'Thi thử' | 'Khác';

export interface Lesson {
  id: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lessonType: LessonType;
  pickupLocation: string;
  trainingLocation: string;
  notes: string;
  status: LessonStatus;
  attendanceStatus: AttendanceStatus;
  resultNote: string;
}

export type PaymentMethod = 'Tiền mặt' | 'Chuyển khoản' | 'Khác';
export type PaymentCategory = 'Đợt 1' | 'Đợt 2' | 'Đợt 3' | 'Thanh toán bổ sung' | 'Hoàn tiền' | 'Khác';

export interface Payment {
  id: string; // Transaction ID
  studentId: string;
  paymentDate: string; // yyyy-MM-dd
  amount: number;
  method: PaymentMethod;
  category: PaymentCategory;
  receiver: string;
  notes: string;
  receiptUrl?: string;
  isCancelled: boolean;
  cancellationReason?: string;
  createdAt: string; // ISO String
  createdBy: string; // User Name / Email
  status?: 'Chờ duyệt' | 'Đã duyệt';
  requestId?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
  userRole: UserRole;
}

export interface AppSettings {
  schoolName: string;
  logoPlaceholder: string;
  defaultLessonDuration: number; // minutes, e.g. 120
  workingHours: {
    start: string; // HH:mm (e.g. 07:00)
    end: string; // HH:mm (e.g. 18:00)
  };
  allowedDurations: number[]; // e.g. [60, 90, 120]
  tuitionReminderThreshold: number; // Remaining amount threshold to warn, e.g., 500000 ₫
  daysWithoutLessonsWarning: number; // Days without lessons, e.g., 7
  courseTypes: string[]; // e.g., ["Trọn gói hạng B1", "Trọn gói hạng B2", "VIP hạng B2", "Hạng C"]
  lessonTypes: LessonType[];
  paymentCategories: PaymentCategory[];
  timezone: string;
  tuitionPrices: {
    A1: number;
    A: number;
    'B số tự động': number;
    'B số sàn': number;
    C1: number;
  };
  autoSchedulingRules: {
    workingHourStart: string;
    workingHourEnd: string;
    safetyBufferMinutes: number;
    maxLessonsPerStudentPerDay: number;
  };
  theme?: 'light' | 'dark';
}

export interface Availability {
  instructorId: string;
  date: string; // yyyy-MM-dd
  available: boolean;
  notes: string;
}

export interface Reminder {
  id: string;
  studentId: string;
  type: string; // e.g. "Học phí", "Lịch học"
  status: 'Pending' | 'Sent' | 'Scheduled';
  message: string;
  createdAt: string; // ISO String
}
