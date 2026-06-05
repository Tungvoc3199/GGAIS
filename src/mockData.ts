/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Student, Instructor, Vehicle, Lesson, Payment, AppSettings, AuditLog } from './types';

export const mockInstructors: Instructor[] = [
  {
    id: 'inst_1',
    name: 'Nguyễn Văn Hùng',
    phone: '0912345678',
    vehicleTypes: ['B số tự động', 'B số sàn', 'C1'],
    workingDays: [1, 2, 3, 4, 5, 6], // Thử Hai -> Thứ Bảy
    workingHours: { start: '07:00', end: '18:00' },
    daysOff: [],
    active: true,
    notes: 'Giảng viên chính khóa sa hình và đường trường nâng cao.'
  },
  {
    id: 'inst_2',
    name: 'Trần Thị Mai',
    phone: '0987654321',
    vehicleTypes: ['A1', 'A', 'B số tự động'],
    workingDays: [1, 2, 3, 4, 5, 7], // Thứ Hai -> Thứ Sáu, Chủ Nhật
    workingHours: { start: '07:30', end: '17:30' },
    daysOff: [],
    active: true,
    notes: 'Kinh nghiệm dạy bằng B số tự động cực tốt, chu đáo nhẹ nhàng.'
  },
  {
    id: 'inst_3',
    name: 'Lê Hoàng Nam',
    phone: '0905556677',
    vehicleTypes: ['B số sàn', 'C1'],
    workingDays: [1, 2, 3, 4, 5, 6],
    workingHours: { start: '07:00', end: '18:00' },
    daysOff: [],
    active: true,
    notes: 'Giảng dạy lý thuyết và thực hành xe số sàn hạng tạ, tải nặng.'
  }
];

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Anchor/reference date originally used in the hardcoded mock statistics
const MOCK_ANCHOR_TIME = new Date('2026-06-01T00:00:00').getTime();
const REAL_ANCHOR_TIME = new Date(getTodayString() + 'T00:00:00').getTime();
const dateOffsetMs = REAL_ANCHOR_TIME - MOCK_ANCHOR_TIME;

const shiftDateString = (origDateStr: string): string => {
  if (!origDateStr) return origDateStr;
  try {
    const parts = origDateStr.split('-');
    if (parts.length === 3 && parts[0] === '2026') {
      const origTime = new Date(origDateStr + 'T00:00:00').getTime();
      const shiftedTime = origTime + dateOffsetMs;
      const shiftedDate = new Date(shiftedTime);
      const year = shiftedDate.getFullYear();
      const month = String(shiftedDate.getMonth() + 1).padStart(2, '0');
      const day = String(shiftedDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('Error shifting date in mock:', origDateStr, e);
  }
  return origDateStr;
};

const rawVehicles: Vehicle[] = [
  {
    id: 'veh_1',
    code: 'XE-26-0001',
    name: 'Toyota Vios 2023 - 1.5E AT',
    plate: '30F-123.45',
    transmission: 'Số tự động',
    category: 'Vios Số Tự Động',
    status: 'Sẵn sàng',
    notes: 'Xe tập lái B số tự động, trang bị phanh phụ kép, hoạt động êm ái.',
    currentMileage: 12450,
    nextOilChangeMileage: 15000,
    nextOilChangeDate: '2026-07-20',
    lastMaintenanceDate: '2026-05-15',
    maintenanceNotes: 'Thay dầu máy định kỳ tại 10,000 km. Đã kiểm tra phanh phụ, hoạt động tốt.',
    expenses: [
      { id: 'exp_val_1_1', date: '2026-05-10', category: 'Xăng xe', amount: 1500000, notes: 'Đổ xăng A95 đầy bình 3 lần đi dã ngoại dắt tay' },
      { id: 'exp_val_1_2', date: '2026-05-15', category: 'Bảo dưỡng', amount: 1200000, notes: 'Thay dầu máy Shell, kiểm tra phanh phụ kép' },
      { id: 'exp_val_1_3', date: '2026-05-20', category: 'Chi phí khác', amount: 300000, notes: 'Rửa xe hút bụi dọn nội thất chuẩn bị đón học viên VIP' }
    ]
  },
  {
    id: 'veh_2',
    code: 'XE-26-0002',
    name: 'Kia Morning 2022 - MT',
    plate: '30G-987.65',
    transmission: 'Số sàn',
    category: 'Morning Số Sàn',
    status: 'Sẵn sàng',
    notes: 'Xe tập lái B số sàn, thăng bằng côn tốt, dễ thi tốt nghiệp.',
    currentMileage: 24820,
    nextOilChangeMileage: 25000,
    nextOilChangeDate: '2026-06-08',
    lastMaintenanceDate: '2026-04-01',
    maintenanceNotes: 'Xe hoạt động bình thường, săp tới chu kỳ thay dầu mới vào mốc 25,000 km.',
    expenses: [
      { id: 'exp_val_2_1', date: '2026-05-12', category: 'Xăng xe', amount: 1800000, notes: 'Xăng xe tập sa hình 10 ngày cuối tháng' },
      { id: 'exp_val_2_2', date: '2026-05-01', category: 'Đăng kiểm', amount: 2400000, notes: 'Đóng phí đường bộ 12 tháng + Phí dịch vụ đăng kiểm xe tập lái' }
    ]
  },
  {
    id: 'veh_3',
    code: 'XE-26-0003',
    name: 'Toyota Vios 2021 - MT',
    plate: '30H-444.55',
    transmission: 'Số sàn',
    category: 'Vios Số Sàn',
    status: 'Bảo dưỡng',
    notes: 'Đang thay bộ ly hợp côn và bảo dưỡng định kỳ (01/06 - 03/06).',
    currentMileage: 48600,
    nextOilChangeMileage: 48000,
    nextOilChangeDate: '2026-06-01',
    lastMaintenanceDate: '2026-03-20',
    maintenanceNotes: 'Cần thay dầu ngay vì đã quá hạn 600 km. Đang cân chỉ lại thước lái và bộ ly hợp.',
    expenses: [
      { id: 'exp_val_3_1', date: '2026-05-25', category: 'Bảo dưỡng', amount: 4500000, notes: 'Thay bộ ly hợp côn guốc ép, vớt bánh đà, đóng lại cao su gầm' },
      { id: 'exp_val_3_2', date: '2026-05-28', category: 'Xăng xe', amount: 1200000, notes: 'Đổ xăng phục vụ ca học đêm sa hình' }
    ]
  },
  {
    id: 'veh_4',
    code: 'XE-26-0004',
    name: 'Isuzu NPR Truck 3.5T',
    plate: '29D-888.88',
    transmission: 'Số sàn',
    category: 'Xe Tải Hạng C',
    status: 'Sẵn sàng',
    notes: 'Xe tải tập lái đường trường và sa hình hạng C.',
    currentMileage: 8500,
    nextOilChangeMileage: 10000,
    nextOilChangeDate: '2026-08-15',
    lastMaintenanceDate: '2026-05-02',
    maintenanceNotes: 'Bảo dưỡng động cơ diesel định kỳ. Hộp số sàn mượt, côn nhạy.',
    expenses: [
      { id: 'exp_val_4_1', date: '2026-05-14', category: 'Xăng xe', amount: 3200000, notes: 'Mua dầu Diesel đỏ đường trường đi dã ngoại học viên Hạng C' },
      { id: 'exp_val_4_2', date: '2026-05-18', category: 'Chi phí khác', amount: 500000, notes: 'Gắn thêm gương cầu phụ để học viên dễ canh bánh trước' }
    ]
  }
];

export const mockVehicles: Vehicle[] = rawVehicles.map(v => ({
  ...v,
  nextOilChangeDate: shiftDateString(v.nextOilChangeDate),
  lastMaintenanceDate: shiftDateString(v.lastMaintenanceDate),
  expenses: v.expenses.map(e => ({
    ...e,
    date: shiftDateString(e.date)
  }))
}));

const rawStudents: Student[] = [
  {
    id: 'stud_1',
    code: 'HV-26-0001',
    name: 'Phạm Minh Tuấn',
    phone: '0911223344',
    dob: '1995-10-12',
    address: '15 Tôn Thất Thuyết, Cầu Giấy, Hà Nội',
    licenseClass: 'B số sàn',
    courseType: 'Trọn gói hạng B2',
    registrationDate: '2026-04-10',
    totalFee: 14000000,
    paidAmount: 8000000,
    remainingAmount: 6000000,
    nextPaymentDeadline: '2026-06-10',
    status: 'Đang học',
    reminderStatus: 'Đã nhắc',
    totalSessions: 12,
    completedSessions: 5,
    remainingSessions: 7,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_2',
    notes: 'Cơ bản ổn, cần luyện thêm bài Đề ba lên dốc vẽ sa hình.'
  },
  {
    id: 'stud_2',
    code: 'HV-26-0002',
    name: 'Nguyễn Thu Thảo',
    phone: '0922334455',
    dob: '1998-05-24',
    address: 'Ngõ 12 Chùa Lộc, Đống Đa, Hà Nội',
    licenseClass: 'B số tự động',
    courseType: 'Trọn gói hạng B1',
    registrationDate: '2026-04-11',
    totalFee: 15000000,
    paidAmount: 15000000,
    remainingAmount: 0,
    nextPaymentDeadline: '2026-06-30',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 14,
    completedSessions: 10,
    remainingSessions: 4,
    assignedInstructorId: 'inst_2',
    assignedVehicleId: 'veh_1',
    notes: 'Lái rất vững, đang ôn sa hình để chuẩn bị đăng ký thi tháng tới.'
  },
  {
    id: 'stud_3',
    code: 'HV-26-0003',
    name: 'Đỗ Hoàng Long',
    phone: '0933445566',
    dob: '1992-02-18',
    address: '42 Trần Phú, Hà Đông, Hà Nội',
    licenseClass: 'C1',
    courseType: 'Hạng C',
    registrationDate: '2026-04-05',
    totalFee: 18000000,
    paidAmount: 5000000,
    remainingAmount: 13000000,
    nextPaymentDeadline: '2026-05-20', // OVERDUE
    status: 'Đang học',
    reminderStatus: 'Đã hẹn ngày thanh toán',
    totalSessions: 16,
    completedSessions: 4,
    remainingSessions: 12,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_4',
    notes: 'Nợ học phí quá hạn từ ngày 20/05. Đã hứa đóng đợt 2 trước ngày 05/06.'
  },
  {
    id: 'stud_4',
    code: 'HV-26-0004',
    name: 'Lê Nhật Minh',
    phone: '0944556677',
    dob: '1997-12-05',
    address: 'Hẻm Ngõ 8 Khương Trung, Thanh Xuân, Hà Nội',
    licenseClass: 'B số sàn',
    courseType: 'Trọn gói hạng B2',
    registrationDate: '2026-01-15',
    totalFee: 14000000,
    paidAmount: 14000000,
    remainingAmount: 0,
    nextPaymentDeadline: '2026-03-15',
    status: 'Đã hoàn thành',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 12,
    completedSessions: 12,
    remainingSessions: 0,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_2',
    notes: 'Đã hoàn thành xuất sắc khóa học huấn luyện đường trường và sa hình.'
  },
  {
    id: 'stud_5',
    code: 'HV-26-0005',
    name: 'Hoàng Thùy Linh',
    phone: '0955667788',
    dob: '2001-08-30',
    address: 'Khu đô thị Văn Phú, Hà Đông, Hà Nội',
    licenseClass: 'A1',
    courseType: 'Trọn gói hạng A1',
    registrationDate: '2026-05-10',
    totalFee: 2500000,
    paidAmount: 2500000,
    remainingAmount: 0,
    nextPaymentDeadline: '2026-05-10',
    status: 'Đã thi',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 2,
    completedSessions: 2,
    remainingSessions: 0,
    assignedInstructorId: 'inst_2',
    assignedVehicleId: 'veh_1',
    notes: 'Đã thi đỗ và nhận bằng lái ngày 25/05/2026.'
  },
  {
    id: 'stud_6',
    code: 'HV-26-0006',
    name: 'Vũ Quốc Anh',
    phone: '0907778899',
    dob: '1990-11-15',
    address: '88 Kim Mã, Ba Đình, Hà Nội',
    licenseClass: 'B số tự động',
    courseType: 'Trọn gói hạng B1',
    registrationDate: '2026-05-15',
    totalFee: 15000000,
    paidAmount: 6000000,
    remainingAmount: 9000000,
    nextPaymentDeadline: '2026-06-15',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 14,
    completedSessions: 2,
    remainingSessions: 12,
    assignedInstructorId: 'inst_1',
    assignedVehicleId: 'veh_1',
    notes: 'Học viên lớn tuổi, thao tác ban đầu chậm nhưng rất cẩn thận.'
  },
  {
    id: 'stud_7',
    code: 'HV-26-0007',
    name: 'Ngô Bảo Châu',
    phone: '0988990011',
    dob: '1993-04-03',
    address: '102 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
    licenseClass: 'B số sàn',
    courseType: 'Trọn gói hạng B2',
    registrationDate: '2026-04-20',
    totalFee: 14000000,
    paidAmount: 0,
    remainingAmount: 14000000,
    nextPaymentDeadline: '2026-05-01', // OVERDUE (unpaid)
    status: 'Mới đăng ký',
    reminderStatus: 'Đã nhắc',
    totalSessions: 12,
    completedSessions: 0,
    remainingSessions: 12,
    assignedInstructorId: 'inst_1',
    assignedVehicleId: 'veh_2',
    notes: 'Đăng ký giữ suất khuyến mãi, chưa bắt đầu học thực hành.'
  },
  {
    id: 'stud_8',
    code: 'HV-26-0008',
    name: 'Trần Tuấn Kiệt',
    phone: '0977882233',
    dob: '1996-09-09',
    address: 'Khu tập thể Thành Công, Ba Đình, Hà Nội',
    licenseClass: 'B số tự động',
    courseType: 'VIP hạng B2',
    registrationDate: '2026-04-18',
    totalFee: 16000000,
    paidAmount: 10000000,
    remainingAmount: 6000000,
    nextPaymentDeadline: '2026-06-18',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 15,
    completedSessions: 8,
    remainingSessions: 7,
    assignedInstructorId: 'inst_2',
    assignedVehicleId: 'veh_1',
    notes: 'Có tư duy không gian tốt, lùi chuồng dọc/ngang rất đẹp.'
  },
  {
    id: 'stud_9',
    code: 'HV-26-0009',
    name: 'Đinh Thị Hương',
    phone: '0966554433',
    dob: '1994-07-21',
    address: 'Trại Cá, Hai Bà Trưng, Hà Nội',
    licenseClass: 'B số sàn',
    courseType: 'Trọn gói hạng B2',
    registrationDate: '2026-04-02',
    totalFee: 14000000,
    paidAmount: 8000000,
    remainingAmount: 6000000,
    nextPaymentDeadline: '2026-06-12',
    status: 'Tạm dừng',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 12,
    completedSessions: 3,
    remainingSessions: 9,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_2',
    notes: 'Tạm dừng do đi công tác 2 tuần, bắt đầu học lại vào tháng 6.'
  },
  {
    id: 'stud_10',
    code: 'HV-26-0010',
    name: 'Mai Văn Chiến',
    phone: '0915151515',
    dob: '1989-01-25',
    address: 'Lĩnh Nam, Hoàng Mai, Hà Nội',
    licenseClass: 'C1',
    courseType: 'Hạng C',
    registrationDate: '2026-03-10',
    totalFee: 18000000,
    paidAmount: 18000000,
    remainingAmount: 0,
    nextPaymentDeadline: '2026-05-10',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 16,
    completedSessions: 15,
    remainingSessions: 1,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_4',
    notes: 'Đang tích lũy phiên đường trường cuối cùng (DAT) chuẩn bị thi tốt nghiệp.'
  },
  {
    id: 'stud_11',
    code: 'HV-26-0011',
    name: 'Nguyễn Đức Huy',
    phone: '0989123456',
    dob: '2000-03-14',
    address: 'Đông Anh, Hà Nội',
    licenseClass: 'B số tự động',
    courseType: 'Trọn gói hạng B1',
    registrationDate: '2026-05-01',
    totalFee: 15000000,
    paidAmount: 10000000,
    remainingAmount: 5000000,
    nextPaymentDeadline: '2026-06-25',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 14,
    completedSessions: 0, // INACTIVE Warning (Chưa học buổi nào!)
    remainingSessions: 14,
    assignedInstructorId: 'inst_1',
    assignedVehicleId: 'veh_1',
    notes: 'Đã hoàn thành lý thuyết, chưa đặt buổi học thực hành nào trong 3 tuần liền.'
  },
  {
    id: 'stud_12',
    code: 'HV-26-0012',
    name: 'Trịnh Kim Chi',
    phone: '0979876543',
    dob: '1991-06-18',
    address: 'Vinhomes Ocean Park, Gia Lâm, Hà Nội',
    licenseClass: 'B số sàn',
    courseType: 'Trọn gói hạng B2',
    registrationDate: '2026-04-15',
    totalFee: 14000000,
    paidAmount: 14000000,
    remainingAmount: 0,
    nextPaymentDeadline: '2026-06-30',
    status: 'Đang học',
    reminderStatus: 'Chưa nhắc',
    totalSessions: 12,
    completedSessions: 1, // INACTIVE Warning (Chưa học thêm 7 ngày!)
    remainingSessions: 11,
    assignedInstructorId: 'inst_3',
    assignedVehicleId: 'veh_2',
    notes: 'Học 1 buổi làm quen xe ngày 18/04, sau đó bận chưa xếp lịch.'
  }
];

export const mockStudents: Student[] = rawStudents.map(s => ({
  ...s,
  registrationDate: shiftDateString(s.registrationDate),
  nextPaymentDeadline: shiftDateString(s.nextPaymentDeadline)
}));

const rawLessons: Lesson[] = [
  // --- PAST LESSONS (Đã hoàn thành) ---
  {
    id: 'less_1',
    studentId: 'stud_1',
    instructorId: 'inst_3',
    vehicleId: 'veh_2',
    date: '2026-05-20',
    startTime: '08:00',
    endTime: '10:00',
    lessonType: 'Làm quen xe',
    pickupLocation: '15 Tôn Thất Thuyết',
    trainingLocation: 'Bãi tập Tây Mỗ',
    notes: 'Học làm quen phanh, ga, số sàn cơ bản.',
    status: 'Đã hoàn thành',
    attendanceStatus: 'Có mặt',
    resultNote: 'Học viên hiểu nhanh, thao tác tốt.'
  },
  {
    id: 'less_2',
    studentId: 'stud_1',
    instructorId: 'inst_3',
    vehicleId: 'veh_2',
    date: '2026-05-24',
    startTime: '08:00',
    endTime: '10:00',
    lessonType: 'Đường trường cơ bản',
    pickupLocation: 'Trần Duy Hưng',
    trainingLocation: 'Đường Nguyễn Xiển mở rộng',
    notes: 'Luyện giữ làn, căn khoảng cách.',
    status: 'Đã hoàn thành',
    attendanceStatus: 'Có mặt',
    resultNote: 'Hơi căng thẳng tay lái, cần thư thả.'
  },
  {
    id: 'less_3',
    studentId: 'stud_2',
    instructorId: 'inst_2',
    vehicleId: 'veh_1',
    date: '2026-05-25',
    startTime: '14:00',
    endTime: '16:00',
    lessonType: 'Sa hình',
    pickupLocation: 'Trạm trung chuyển Cầu Giấy',
    trainingLocation: 'Sân tập Chèm',
    notes: 'Học ghép hàng dọc, bài vệt bánh xe.',
    status: 'Đã hoàn thành',
    attendanceStatus: 'Có mặt',
    resultNote: 'Bị cán vạch sa hình vệt bánh xe, ôn lại sau.'
  },
  {
    id: 'less_4',
    studentId: 'stud_3',
    instructorId: 'inst_3',
    vehicleId: 'veh_4',
    date: '2026-05-26',
    startTime: '10:00',
    endTime: '12:00',
    lessonType: 'Làm quen xe',
    pickupLocation: '42 Trần Phú, Hà Đông',
    trainingLocation: 'Sân tập Hà Đông',
    notes: 'Học cách vào số, quan sát gương chiếu hậu xe tải.',
    status: 'Đã hoàn thành',
    attendanceStatus: 'Có mặt',
    resultNote: 'An toàn, làm chủ tầm quan sát cabin tốt.'
  },

  // --- TODAY'S SCHEDULED LESSONS (01/06/2026) ---
  {
    id: 'less_today_1',
    studentId: 'stud_1',
    instructorId: 'inst_3',
    vehicleId: 'veh_2',
    date: '2026-06-01',
    startTime: '08:00',
    endTime: '10:00',
    lessonType: 'Sa hình',
    pickupLocation: 'Cổng ĐH Giao Thông Vận Tải',
    trainingLocation: 'Sân Nam Trung Yên',
    notes: 'Thực hành 11 bài thi liên hoàn lần đầu.',
    status: 'Đã hoàn thành',
    attendanceStatus: 'Có mặt',
    resultNote: 'Cần chú ý căn điểm mốc đề-ba dốc.'
  },
  {
    id: 'less_today_2',
    studentId: 'stud_2',
    instructorId: 'inst_2',
    vehicleId: 'veh_1',
    date: '2026-06-01',
    startTime: '09:00',
    endTime: '11:00',
    lessonType: 'Thi thử',
    pickupLocation: 'Ngã tư Khuất Duy Tiến',
    trainingLocation: 'Sân thi sát hạch Ngọc Hà',
    notes: 'Chạy thử chip rà soát điểm yếu trước kì thi.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },
  {
    id: 'less_today_3',
    studentId: 'stud_6',
    instructorId: 'inst_1',
    vehicleId: 'veh_1',
    date: '2026-06-01',
    startTime: '14:00',
    endTime: '16:00',
    lessonType: 'Làm quen xe',
    pickupLocation: '88 Kim Mã',
    trainingLocation: 'Sân Nam Trung Yên',
    notes: 'Lớp 1-1, học đánh vô lăng và cảm nhận chân phanh tự động.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },

  // --- FUTURE LESSONS + CONFLICTS PRE-GENERATED ---
  {
    id: 'less_fut_1',
    studentId: 'stud_8',
    instructorId: 'inst_2',
    vehicleId: 'veh_1',
    date: '2026-06-02',
    startTime: '08:00',
    endTime: '10:00',
    lessonType: 'Đường trường cơ bản',
    pickupLocation: 'Bến xe Mỹ Đình',
    trainingLocation: 'Trục đại lộ Thăng Long',
    notes: 'Tập căn chỉnh bánh phụ tầm trung và canh lề xe tự động.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },
  {
    id: 'less_fut_2',
    studentId: 'stud_10',
    instructorId: 'inst_3',
    vehicleId: 'veh_4',
    date: '2026-06-02',
    startTime: '14:00',
    endTime: '16:00',
    lessonType: 'Đường trường nâng cao',
    pickupLocation: 'Cầu Thanh Trì',
    trainingLocation: 'Quốc lộ 5 cũ',
    notes: 'Lái thực tế DAT liên tỉnh Hà Nội - Bắc Ninh.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },

  // --- DEMO CONFLICT 1: Giảng viên inst_1 bị phân trùng giờ ngày 03/06 (08:30 - 10:30) cho stud_11 và stud_6 ---
  {
    id: 'conflict_1_a',
    studentId: 'stud_11',
    instructorId: 'inst_1',
    vehicleId: 'veh_1',
    date: '2026-06-03',
    startTime: '08:30',
    endTime: '10:30',
    lessonType: 'Làm quen xe',
    pickupLocation: 'Bến xe Mỹ Đình',
    trainingLocation: 'Sân tập Tây Mỗ',
    notes: 'Trùng lịch nghiêm trọng: Phân cùng Giảng viên Hùng và Xe Vios số tự động.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },
  {
    id: 'conflict_1_b',
    studentId: 'stud_6',
    instructorId: 'inst_1',
    vehicleId: 'veh_1',
    date: '2026-06-03',
    startTime: '09:00',
    endTime: '11:00', // Gió gối đầu trùng nhau từ 09:00 tới 10:30!
    lessonType: 'Đường trường cơ bản',
    pickupLocation: 'Kiến Hưng, Hà Đông',
    trainingLocation: 'Trục Văn Phú',
    notes: 'Trùng lịch giảng viên và xe với HV Nguyễn Đức Huy.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },

  // --- DEMO CONFLICT 2: Xe tập lái B số sàn veh_2 bị phân trùng giờ lúc (15:00 - 17:00) ngày 03/06 cho inst_1 và inst_3 ---
  {
    id: 'conflict_2_a',
    studentId: 'stud_1',
    instructorId: 'inst_3',
    vehicleId: 'veh_2',
    date: '2026-06-03',
    startTime: '15:00',
    endTime: '17:00',
    lessonType: 'Sa hình',
    pickupLocation: 'Khu tập thể Thanh Xuân',
    trainingLocation: 'Bãi ngầm Sài Đồng',
    notes: 'Xe Morning MT (veh_2) bị trưng dụng đồng thời bởi 2 thầy dạy.',
    status: 'Chờ xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  },
  {
    id: 'conflict_2_b',
    studentId: 'stud_9',
    instructorId: 'inst_1',
    vehicleId: 'veh_2',
    date: '2026-06-03',
    startTime: '15:30',
    endTime: '17:30', // Xe veh_2 bị trùng gối đầu từ 15:30 tới 17:00
    lessonType: 'Bổ túc tay lái',
    pickupLocation: 'Khu tập thể Kim Liên',
    trainingLocation: 'Nội thành phố cổ',
    notes: 'Trùng xe Morning MT tập lái.',
    status: 'Đã xác nhận',
    attendanceStatus: 'Chưa điểm danh',
    resultNote: ''
  }
];

export const mockLessons: Lesson[] = rawLessons.map(l => ({
  ...l,
  date: shiftDateString(l.date)
}));

const rawPayments: Payment[] = [
  {
    id: 'pay_1',
    studentId: 'stud_1',
    paymentDate: '2026-04-10',
    amount: 5000000,
    method: 'Tiền mặt',
    category: 'Đợt 1',
    receiver: 'Đào Hải Đăng (Quầy Thu ngân)',
    notes: 'Đóng học phí đặt cọc làm hồ sơ Đợt 1.',
    isCancelled: false,
    createdAt: '2026-04-10T09:30:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  },
  {
    id: 'pay_2',
    studentId: 'stud_1',
    paymentDate: '2026-05-15',
    amount: 3000000,
    method: 'Chuyển khoản',
    category: 'Đợt 2',
    receiver: 'Hồ Thị Thu (Thu ngân số 2)',
    notes: 'Nộp học phí bồi bổ thực hành sa hình tập.',
    isCancelled: false,
    createdAt: '2026-05-15T11:00:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  },
  {
    id: 'pay_3',
    studentId: 'stud_2',
    paymentDate: '2026-04-11',
    amount: 15000000,
    method: 'Chuyển khoản',
    category: 'Đợt 1',
    receiver: 'Đào Hải Đăng (Quầy Thu ngân)',
    notes: 'Học viên nộp ĐỦ trọn gói 100% nhận hồ sơ ưu đãi giảm giá.',
    isCancelled: false,
    createdAt: '2026-04-11T10:15:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  },
  {
    id: 'pay_4',
    studentId: 'stud_3',
    paymentDate: '2026-04-05',
    amount: 5000000,
    method: 'Chuyển khoản',
    category: 'Đợt 1',
    receiver: 'Hồ Thị Thu (Thu ngân số 2)',
    notes: 'Nộp đợt 1 khóa Hạng C.',
    isCancelled: false,
    createdAt: '2026-04-05T08:45:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  },
  {
    id: 'pay_5',
    studentId: 'stud_6',
    paymentDate: '2026-05-15',
    amount: 6000000,
    method: 'Tiền mặt',
    category: 'Đợt 1',
    receiver: 'Đào Hải Đăng (Quầy Thu ngân)',
    notes: 'Làm hồ sơ nhập học đợt 1 khóa B1.',
    isCancelled: false,
    createdAt: '2026-05-15T15:20:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  },
  {
    id: 'pay_cancelled_demo',
    studentId: 'stud_8',
    paymentDate: '2026-04-18',
    amount: 2000000,
    method: 'Chuyển khoản',
    category: 'Khác',
    receiver: 'Hồ Thị Thu (Thu ngân số 2)',
    notes: 'Chuyển sai tài khoản trường lái, kế toán bấm hoàn trả khách hàng.',
    isCancelled: true,
    cancellationReason: 'Nộp nhầm tài khoản cá nhân thay vì tài khoản trường, đã chuyển hoàn ngay.',
    createdAt: '2026-04-18T16:00:00Z',
    createdBy: 'anhduongnguyen12521@gmail.com'
  }
];

export const mockPayments: Payment[] = rawPayments.map(p => ({
  ...p,
  paymentDate: shiftDateString(p.paymentDate)
}));

export const defaultSettings: AppSettings = {
  schoolName: 'TRUNG TÂM ĐÀO TẠO LÁI XE BÁCH KHOA',
  logoPlaceholder: '🚗 LỊCH HỌC PRO',
  defaultLessonDuration: 120, // 2 tiếng
  workingHours: { start: '07:00', end: '18:00' },
  allowedDurations: [60, 90, 120],
  tuitionReminderThreshold: 5000000, // 5 triệu đồng trở lên
  daysWithoutLessonsWarning: 7, // 7 ngày không đặt lịch
  courseTypes: [
    'Trọn gói hạng A1',
    'Trọn gói hạng B1',
    'Trọn gói hạng B2',
    'VIP hạng B2',
    'Hạng C'
  ],
  lessonTypes: [
    'Làm quen xe',
    'Đường trường cơ bản',
    'Đường trường nâng cao',
    'Sa hình',
    'Bổ túc tay lái',
    'Thi thử',
    'Khác'
  ],
  paymentCategories: [
    'Đợt 1',
    'Đợt 2',
    'Đợt 3',
    'Thanh toán bổ sung',
    'Hoàn tiền',
    'Khác'
  ],
  timezone: 'Asia/Ho_Chi_Minh',
  tuitionPrices: {
    A1: 1200000,
    A: 1200000,
    'B số tự động': 13500000,
    'B số sàn': 14000000,
    C1: 16500000
  },
  autoSchedulingRules: {
    workingHourStart: '07:00',
    workingHourEnd: '18:00',
    safetyBufferMinutes: 15,
    maxLessonsPerStudentPerDay: 1
  },
  theme: 'light'
};
