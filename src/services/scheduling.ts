/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson, Instructor, Vehicle, AppSettings, Student } from '../types';

const INACTIVE_LESSON_STATUSES = new Set([
  'Học viên báo nghỉ',
  'Giảng viên báo nghỉ',
  'Hủy lịch'
]);

interface ConflictResult {
  hasConflict: boolean;
  reasons: string[];
}

interface ConflictCheckOptions {
  /**
   * Manual booking must only block real overlapping time.
   * Auto scheduling can turn this on to reserve the safety gap between lessons.
   */
  enforceSafetyBuffer?: boolean;
  /**
   * Manual booking is allowed to place multiple lessons in one day when staff decides so.
   * Auto scheduling can turn this on to avoid overbooking students automatically.
   */
  enforceStudentDailyLimit?: boolean;
}

/**
 * Converts a time string "HH:mm" into minutes since start of day.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
  return h * 60 + m;
}

/**
 * Converts minutes since start of day back to a static "HH:mm" string.
 */
export function minutesToTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Determines if two time intervals overlap.
 */
export function doIntervalsOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  if (![s1, e1, s2, e2].every(Number.isFinite)) return false;
  return s1 < e2 && s2 < e1;
}

function isInstructorOperational(instructor: any): boolean {
  const status = String(instructor?.status || '').trim().toLowerCase();
  if (instructor?.active === false) return false;

  const blockedKeywords = ['tạm nghỉ', 'nghỉ việc', 'ngừng', 'không hoạt động', 'khóa'];
  if (blockedKeywords.some(k => status.includes(k))) return false;

  return true;
}

function isVehicleOperational(status: any): boolean {
  const value = String(status || '').trim();
  const lower = value.toLowerCase();

  const inactiveKeywords = [
    'bảo dưỡng',
    'sửa',
    'hỏng',
    'ngừng',
    'không hoạt động',
    'khóa',
    'đã bán'
  ];

  if (inactiveKeywords.some(keyword => lower.includes(keyword))) {
    return false;
  }

  const activeStatuses = new Set([
    'Đang hoạt động',
    'Hoạt động',
    'Hoạt động bình thường',
    'Sẵn sàng',
    'Sẵn sàng vận hành',
    'Available',
    'Active'
  ]);

  return activeStatuses.has(value) || !value;
}

function isCancelledLesson(lesson: Lesson): boolean {
  return INACTIVE_LESSON_STATUSES.has(lesson.status);
}

/**
 * Checks for schedule conflicts.
 *
 * Default mode is manual booking:
 * - block real overlap only;
 * - do not block safety buffer;
 * - do not block the student daily lesson limit.
 *
 * Auto scheduling must opt in through options.
 */
export function checkLessonConflicts(
  newLesson: {
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    startTime: string;
    endTime: string;
    id?: string;
  },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings?: AppSettings,
  students?: Student[],
  options: ConflictCheckOptions = {}
): ConflictResult {
  const reasons: string[] = [];
  const startM = timeToMinutes(newLesson.startTime);
  const endM = timeToMinutes(newLesson.endTime);

  if (!Number.isFinite(startM) || !Number.isFinite(endM) || endM <= startM) {
    reasons.push('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
    return { hasConflict: true, reasons };
  }

  const enforceSafetyBuffer = options.enforceSafetyBuffer === true;
  const enforceStudentDailyLimit = options.enforceStudentDailyLimit === true;
  const buffer = enforceSafetyBuffer
    ? settings?.autoSchedulingRules?.safetyBufferMinutes || 0
    : 0;
  const maxDayLessons = settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1;

  const student = students?.find(s => s.id === newLesson.studentId);
  const teacher = instructors.find(i => i.id === newLesson.instructorId);
  const car = vehicles.find(v => v.id === newLesson.vehicleId);

  if (teacher) {
    if (!isInstructorOperational(teacher)) {
      reasons.push(`Giảng viên ${teacher.name} không ở trạng thái hoạt động hoặc tạm nghỉ.`);
    }

    const teachHours = teacher.workingHours || { start: '07:00', end: '21:00' };
    const teachStart = timeToMinutes(teachHours.start);
    const teachEnd = timeToMinutes(teachHours.end);

    if (Number.isFinite(teachStart) && Number.isFinite(teachEnd) && (startM < teachStart || endM > teachEnd)) {
      reasons.push(`Ngoài khung giờ làm việc của GV ${teacher.name} (${teachHours.start} - ${teachHours.end})`);
    }

    if (teacher.daysOff && teacher.daysOff.includes(newLesson.date)) {
      reasons.push(`Giảng viên ${teacher.name} đang nghỉ phép vào ngày ${newLesson.date}.`);
    }
  }

  if (car && !isVehicleOperational(car.status)) {
    reasons.push(`Xe tập ${car.name} (${car.plate}) chưa đủ điều kiện vận hành. Trạng thái hiện tại: ${car.status || 'Chưa khai báo'}.`);
  }

  if (student) {
    if (enforceStudentDailyLimit) {
      const studentLessonsOnDay = existingLessons.filter(l =>
        l.studentId === newLesson.studentId &&
        l.date === newLesson.date &&
        l.id !== newLesson.id &&
        !isCancelledLesson(l)
      ).length;

      if (studentLessonsOnDay >= maxDayLessons) {
        reasons.push(`Học viên ${student.name} đã đăng ký học tối đa ${maxDayLessons} ca trong ngày ${newLesson.date}.`);
      }
    }

    if (teacher && !teacher.vehicleTypes.includes(student.licenseClass)) {
      reasons.push(`Hạng bằng học viên (${student.licenseClass}) nằm ngoài phân loại có tuyển của giảng viên ${teacher.name} (${teacher.vehicleTypes.join(', ')}).`);
    }

    if (car) {
      if (car.suitableLicenseClass && car.suitableLicenseClass !== student.licenseClass) {
        reasons.push(`Xe tập ${car.name} (${car.plate}) chỉ phù hợp đào tạo hạng ${car.suitableLicenseClass}, học viên ký hạng ${student.licenseClass}.`);
      }

      if (student.licenseClass === 'B số tự động' && car.transmission !== 'Số tự động') {
        reasons.push('Học viên học hạng B số tự động không được xếp tập trên xe Số sàn.');
      } else if ((student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && car.transmission !== 'Số sàn') {
        reasons.push(`Học viên học hạng ${student.licenseClass} không được xếp tập trên xe Số tự động.`);
      }
    }
  }

  for (const lesson of existingLessons) {
    if (lesson.id === newLesson.id || isCancelledLesson(lesson) || lesson.date !== newLesson.date) {
      continue;
    }

    const itemStartM = timeToMinutes(lesson.startTime);
    const itemEndM = timeToMinutes(lesson.endTime);
    if (!Number.isFinite(itemStartM) || !Number.isFinite(itemEndM)) {
      continue;
    }

    const overlap = startM < itemEndM && itemStartM < endM;
    const bufferOverlap = startM < itemEndM + buffer && itemStartM - buffer < endM;

    if (!bufferOverlap) continue;

    if (lesson.studentId === newLesson.studentId) {
      reasons.push(
        overlap
          ? `Học viên đã bận lịch học khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`
          : `Khoảng nghỉ của học viên giữa các ca chưa đạt thiết lập tối thiểu ${buffer} phút (${lesson.startTime} - ${lesson.endTime}).`
      );
    }

    if (lesson.instructorId === newLesson.instructorId) {
      reasons.push(
        overlap
          ? `Giảng viên bận dạy lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`
          : `Giảng viên kẹt mốc thời gian nghỉ tối thiểu ${buffer} phút với ca dạy kề nhau (${lesson.startTime} - ${lesson.endTime}).`
      );
    }

    if (lesson.vehicleId === newLesson.vehicleId) {
      reasons.push(
        overlap
          ? `Xe tập lái (${car?.plate || 'Phân công'}) đã bận phục vụ lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`
          : `Xe tập lái cần khoảng nghỉ tối thiểu ${buffer} phút trước ca tiếp theo (${lesson.startTime} - ${lesson.endTime}).`
      );
    }
  }

  return {
    hasConflict: reasons.length > 0,
    reasons: [...new Set(reasons)]
  };
}

/**
 * Suggests the next three available slots if a conflict occurs.
 */
export function suggestAvailableSlots(
  request: {
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    duration: number;
  },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings,
  students?: Student[],
  options: ConflictCheckOptions = {}
): { date: string; startTime: string; endTime: string }[] {
  const suggestions: { date: string; startTime: string; endTime: string }[] = [];
  const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
  const startMinutes = timeToMinutes(schoolHours.start);
  const endMinutes = timeToMinutes(schoolHours.end);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || request.duration <= 0) {
    return suggestions;
  }

  const currentDay = new Date(request.date);

  for (let d = 0; d < 7; d++) {
    const dayStr = currentDay.toISOString().split('T')[0];

    for (let min = startMinutes; min + request.duration <= endMinutes; min += 30) {
      const candStart = minutesToTime(min);
      const candEnd = minutesToTime(min + request.duration);

      const check = checkLessonConflicts(
        {
          studentId: request.studentId,
          instructorId: request.instructorId,
          vehicleId: request.vehicleId,
          date: dayStr,
          startTime: candStart,
          endTime: candEnd
        },
        existingLessons,
        instructors,
        vehicles,
        settings,
        students,
        options
      );

      if (!check.hasConflict) {
        suggestions.push({ date: dayStr, startTime: candStart, endTime: candEnd });
        if (suggestions.length >= 3) return suggestions;
      }
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return suggestions;
}

/**
 * Reusable Auto-Scheduling Wizard Engine.
 * Auto mode explicitly enforces safety buffer and daily lesson limits.
 */
export function runAutoSchedulingEngine(
  params: {
    studentIds: string[];
    startDate: string;
    endDate: string;
    duration: number;
    preferredDays: number[];
    preferredTimeRanges: { start: string; end: string }[];
    instructorPref: string;
    vehiclePref: string;
  },
  students: Student[],
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings
): {
  success: boolean;
  suggestions: {
    id: string;
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    startTime: string;
    endTime: string;
    lessonType: 'Sa hình' | 'Đường trường cơ bản' | 'Làm quen xe';
    warnings: string[];
  }[];
} {
  const suggestions: {
    id: string;
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    startTime: string;
    endTime: string;
    lessonType: 'Sa hình' | 'Đường trường cơ bản' | 'Làm quen xe';
    warnings: string[];
  }[] = [];

  const autoConflictOptions: ConflictCheckOptions = {
    enforceSafetyBuffer: true,
    enforceStudentDailyLimit: true
  };

  const sortedStudentIds = [...params.studentIds].sort((aId, bId) => {
    const sA = students.find(s => s.id === aId);
    const sB = students.find(s => s.id === bId);
    if (!sA || !sB) return 0;
    return sA.completedSessions - sB.completedSessions;
  });

  const tempArrLessons = [...existingLessons];

  for (const studId of sortedStudentIds) {
    const studentObj = students.find(s => s.id === studId);
    if (!studentObj) continue;

    let teacherId = params.instructorPref;
    if (teacherId === 'auto') {
      teacherId = studentObj.assignedInstructorId || instructors[0]?.id || '';
    }

    let carId = params.vehiclePref;
    if (carId === 'auto') {
      carId = studentObj.assignedVehicleId || vehicles[0]?.id || '';
    }

    let found = false;
    const dateStartObj = new Date(params.startDate);
    const dateEndObj = new Date(params.endDate);
    const checkLimitDays = Math.ceil((dateEndObj.getTime() - dateStartObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    for (let dayOffset = 0; dayOffset < checkLimitDays; dayOffset++) {
      const loopDateObj = new Date(dateStartObj);
      loopDateObj.setDate(loopDateObj.getDate() + dayOffset);
      const loopDateStr = loopDateObj.toISOString().split('T')[0];

      let dayOfWeek = loopDateObj.getDay();
      if (dayOfWeek === 0) dayOfWeek = 7;
      if (params.preferredDays.length > 0 && !params.preferredDays.includes(dayOfWeek)) {
        continue;
      }

      const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
      const timeRanges = params.preferredTimeRanges.length > 0
        ? params.preferredTimeRanges
        : [{ start: schoolHours.start, end: schoolHours.end }];

      for (const range of timeRanges) {
        const earliestMin = timeToMinutes(range.start);
        const latestMin = timeToMinutes(range.end);
        if (!Number.isFinite(earliestMin) || !Number.isFinite(latestMin)) continue;

        for (let tMin = earliestMin; tMin + params.duration <= latestMin; tMin += 30) {
          const candStart = minutesToTime(tMin);
          const candEnd = minutesToTime(tMin + params.duration);

          const conflictCheck = checkLessonConflicts(
            {
              studentId: studId,
              instructorId: teacherId,
              vehicleId: carId,
              date: loopDateStr,
              startTime: candStart,
              endTime: candEnd
            },
            tempArrLessons,
            instructors,
            vehicles,
            settings,
            students,
            autoConflictOptions
          );

          if (!conflictCheck.hasConflict) {
            const newSug = {
              id: `sug_${Math.random().toString(36).substr(2, 9)}`,
              studentId: studId,
              instructorId: teacherId,
              vehicleId: carId,
              date: loopDateStr,
              startTime: candStart,
              endTime: candEnd,
              lessonType: (studentObj.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as 'Sa hình' | 'Đường trường cơ bản' | 'Làm quen xe',
              warnings: []
            };

            suggestions.push(newSug);
            tempArrLessons.push({
              id: newSug.id,
              ...newSug,
              notes: 'Simulated automatic slot',
              status: 'Chờ xác nhận',
              attendanceStatus: 'Chưa điểm danh',
              resultNote: '',
              pickupLocation: studentObj.address,
              trainingLocation: 'Bãi tập Trung tâm'
            } as Lesson);

            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }

    if (!found) {
      const altOptions = suggestAvailableSlots(
        {
          studentId: studId,
          instructorId: teacherId,
          vehicleId: carId,
          date: params.startDate,
          duration: params.duration
        },
        tempArrLessons,
        instructors,
        vehicles,
        settings,
        students,
        autoConflictOptions
      );

      suggestions.push({
        id: `sug_err_${Math.random().toString(36).substr(2, 9)}`,
        studentId: studId,
        instructorId: teacherId,
        vehicleId: carId,
        date: params.startDate,
        startTime: '08:00',
        endTime: minutesToTime(timeToMinutes('08:00') + params.duration),
        lessonType: 'Sa hình',
        warnings: [
          `Không tìm thấy khoảng thời gian trống phù hợp từ ${params.startDate} tới ${params.endDate}.`,
          altOptions.length > 0
            ? `Phương án thay thế đề xuất: ${altOptions.map(o => `${o.startTime} - ${o.endTime} (${o.date})`).join(', ')}`
            : 'Đề xuất: Giảm bớt các yêu cầu gán ép hoặc chọn tuần học khác.'
        ]
      });
    }
  }

  return {
    success: true,
    suggestions
  };
}

/**
 * Lists the free slots of the day classified by Instructor or Vehicle.
 */
export function getFreeSlotsReport(
  date: string,
  instructorId: string,
  vehicleId: string,
  durationMinutes: number,
  existingLessons: Lesson[],
  settings: AppSettings
): { startTime: string; endTime: string; label: string }[] {
  const schoolHours = settings?.workingHours || { start: '07:00', end: '18:05' };
  const minStart = timeToMinutes(schoolHours.start);
  const minEnd = timeToMinutes(schoolHours.end);
  const freeSlots: { startTime: string; endTime: string; label: string }[] = [];

  if (!Number.isFinite(minStart) || !Number.isFinite(minEnd) || durationMinutes <= 0) {
    return freeSlots;
  }

  for (let m = minStart; m + durationMinutes <= minEnd; m += 30) {
    const startStr = minutesToTime(m);
    const endStr = minutesToTime(m + durationMinutes);

    let isReserved = false;
    for (const les of existingLessons) {
      if (isCancelledLesson(les)) continue;
      if (les.date !== date) continue;

      const overlaps = doIntervalsOverlap(startStr, endStr, les.startTime, les.endTime);
      if (overlaps && (les.instructorId === instructorId || les.vehicleId === vehicleId)) {
        isReserved = true;
        break;
      }
    }

    if (!isReserved) {
      let segment = 'Sáng';
      if (m >= 720 && m < 1020) segment = 'Chiều';
      else if (m >= 1020) segment = 'Tối';

      freeSlots.push({
        startTime: startStr,
        endTime: endStr,
        label: `${startStr} - ${endStr} (${segment})`
      });
    }
  }

  return freeSlots;
}
