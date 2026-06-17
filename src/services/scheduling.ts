/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson, Instructor, Vehicle, AppSettings, Student } from '../types';

/**
 * Converts a time string "HH:mm" into minutes since start of day.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes since start of day back to a static "HH:mm" string.
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
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
  return s1 < e2 && s2 < e1;
}

interface ConflictResult {
  hasConflict: boolean;
  reasons: string[];
}

function isInstructorOperational(instructor: any): boolean {
  const status = String(instructor?.status || '').trim().toLowerCase();
  if (instructor?.active === false) return false;

  const blockedKeywords = ['tạm nghỉ', 'nghỉ việc', 'ngừng', 'không hoạt động', 'khóa'];
  if (blockedKeywords.some(k => status.includes(k))) return false;

  return true;
}

function isVehicleOperational(status: any): boolean {
  const value = String(status || "").trim();
  const lower = value.toLowerCase();

  const inactiveKeywords = [
    "bảo dưỡng",
    "sửa",
    "hỏng",
    "ngừng",
    "không hoạt động",
    "khóa",
    "đã bán"
  ];

  if (inactiveKeywords.some(keyword => lower.includes(keyword))) {
    return false;
  }

  const activeStatuses = new Set([
    "Đang hoạt động",
    "Hoạt động",
    "Hoạt động bình thường",
    "Sẵn sàng",
    "Sẵn sàng vận hành",
    "Available",
    "Active"
  ]);

  return activeStatuses.has(value) || !value;
}

/**
 * Checks for any scheduling overlaps for student, instructor, or vehicle.
 */
export function checkLessonConflicts(
  newLesson: {
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string;
    startTime: string;
    endTime: string;
    id?: string; // Optional if we are editing an existing lesson
  },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings?: AppSettings,
  students?: Student[]
): ConflictResult {
  const reasons: string[] = [];
  const start = newLesson.startTime;
  const end = newLesson.endTime;
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);

  // Validate basic operational constraints
  if (endM <= startM) {
    reasons.push('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
    return { hasConflict: true, reasons };
  }

  const student = students?.find(s => s.id === newLesson.studentId);
  const buffer = settings?.autoSchedulingRules?.safetyBufferMinutes || 0;
  const maxDayLessons = settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1;

  // 1. Check constraints against holidays/working hours
  const teacher = instructors.find(i => i.id === newLesson.instructorId);
  if (teacher) {
    if (!isInstructorOperational(teacher)) {
      reasons.push(`Giảng viên ${teacher.name} không ở trạng thái hoạt động hoặc tạm nghỉ.`);
    }

    // Check if within working hours
    const teachHours = teacher.workingHours || { start: '07:00', end: '21:00' };
    const teachStart = timeToMinutes(teachHours.start);
    const teachEnd = timeToMinutes(teachHours.end);

    if (startM < teachStart || endM > teachEnd) {
      reasons.push(
        `Ngoài khung giờ làm việc của GV ${teacher.name} (${teachHours.start} - ${teachHours.end})`
      );
    }

    // Check if teacher has this day off
    if (teacher.daysOff && teacher.daysOff.includes(newLesson.date)) {
      reasons.push(`Giảng viên ${teacher.name} đang nghỉ phép vào ngày ${newLesson.date}.`);
    }
  }

  // Check vehicle status
  const car = vehicles.find(v => v.id === newLesson.vehicleId);
  if (car && !isVehicleOperational(car.status)) {
    reasons.push(`Xe tập ${car.name} (${car.plate}) chưa đủ điều kiện vận hành. Trạng thái hiện tại: ${car.status || "Chưa khai báo"}.`);
  }

  if (student) {
    // Max lessons limit per day per student
    const studentLessonsOnDay = existingLessons.filter(l => 
      l.studentId === newLesson.studentId && 
      l.date === newLesson.date &&
      l.id !== newLesson.id &&
      l.status !== 'Học viên báo nghỉ' && 
      l.status !== 'Giảng viên báo nghỉ' && 
      l.status !== 'Hủy lịch'
    ).length;

    if (studentLessonsOnDay >= maxDayLessons) {
      reasons.push(`Học viên ${student.name} đã đăng ký học tối đa ${maxDayLessons} ca trong ngày ${newLesson.date}.`);
    }

    // Instructor license compatibility
    if (teacher && !teacher.vehicleTypes.includes(student.licenseClass)) {
      reasons.push(`Hạng bằng học viên (${student.licenseClass}) nằm ngoài phân loại có tuyển của giảng viên ${teacher.name} (${teacher.vehicleTypes.join(', ')}).`);
    }

    // Vehicle license & transmission compatibility
    if (car) {
      if (car.suitableLicenseClass && car.suitableLicenseClass !== student.licenseClass) {
        reasons.push(`Xe tập ${car.name} (${car.plate}) chỉ phù hợp đào tạo hạng ${car.suitableLicenseClass}, học viên ký hạng ${student.licenseClass}.`);
      }

      if (student.licenseClass === 'B số tự động' && car.transmission !== 'Số tự động') {
        reasons.push(`Học viên học hạng B số tự động (B1) không được xếp tập trên xe Số sàn (Manual).`);
      } else if ((student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && car.transmission !== 'Số sàn') {
        reasons.push(`Học viên học hạng ${student.licenseClass} không được xếp tập trên xe Số tự động (Automatic).`);
      }
    }
  }

  // 2. Overlap and Safety buffer checks
  for (const lesson of existingLessons) {
    if (lesson.id === newLesson.id) continue; // Skip itself if editing
    // Cancelled lessons do not hold slots
    if (lesson.status === 'Học viên báo nghỉ' || lesson.status === 'Giảng viên báo nghỉ' || lesson.status === 'Hủy lịch') {
      continue;
    }

    if (lesson.date === newLesson.date) {
      const itemStartM = timeToMinutes(lesson.startTime);
      const itemEndM = timeToMinutes(lesson.endTime);
      
      const overlap = startM < itemEndM && itemStartM < endM;
      const bufferOverlap = startM < itemEndM + buffer && itemStartM - buffer < endM;

      if (bufferOverlap) {
        if (lesson.studentId === newLesson.studentId) {
          if (overlap) {
            reasons.push(`Học viên đã bận lịch học khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
          } else {
            reasons.push(`Khoảng nghỉ của học viên giữa các ca chưa đạt thiết lập tối thiểu ${buffer} phút (${lesson.startTime} - ${lesson.endTime}).`);
          }
        }
        if (lesson.instructorId === newLesson.instructorId) {
          if (overlap) {
            reasons.push(`Giảng viên bận dạy lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
          } else {
            reasons.push(`Giảng viên kẹt mốc thời gian nghỉ tối thiểu ${buffer} phút với ca dạy kề nhau (${lesson.startTime} - ${lesson.endTime}).`);
          }
        }
        if (lesson.vehicleId === newLesson.vehicleId) {
          if (overlap) {
            reasons.push(`Xe tập lái (${car?.plate || 'Phân công'}) đã bận phục vụ lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
          } else {
            reasons.push(`Xe tập lái cần khoảng nghỉ tối thiểu ${buffer} phút trước ca tiếp theo (${lesson.startTime} - ${lesson.endTime}).`);
          }
        }
      }
    }
  }

  return {
    hasConflict: reasons.length > 0,
    reasons
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
    duration: number; // minutes
  },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings
): { date: string; startTime: string; endTime: string }[] {
  const suggestions: { date: string; startTime: string; endTime: string }[] = [];
  const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
  const startMinutes = timeToMinutes(schoolHours.start);
  const endMinutes = timeToMinutes(schoolHours.end);

  let currentDay = new Date(request.date);

  // Search up to 7 days into the future
  for (let d = 0; d < 7; d++) {
    // Format date as yyyy-MM-dd
    const dayStr = currentDay.toISOString().split('T')[0];

    // Try multiple start times inside working hours (e.g., every 30 mins)
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
        vehicles
      );

      if (!check.hasConflict) {
        suggestions.push({
          date: dayStr,
          startTime: candStart,
          endTime: candEnd
        });

        if (suggestions.length >= 3) {
          return suggestions;
        }
      }
    }

    // Step to next day
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return suggestions;
}

/**
 * Reusable Auto-Scheduling Wizard Engine
 * Prioritizes students who have not learned recently or whose exam date is approaching.
 */
export function runAutoSchedulingEngine(
  params: {
    studentIds: string[];
    startDate: string;
    endDate: string;
    duration: number; // minutes
    preferredDays: number[]; // weekdays (0 = Sunday, 1 = Monday ...)
    preferredTimeRanges: { start: string; end: string }[];
    instructorPref: string; // "auto" or spec ID
    vehiclePref: string; // "auto" or spec ID
  },
  students: Student[],
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings
): {
  success: boolean;
  suggestions: {
    id: string; // temporary random id for view list
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
  const suggestions: any[] = [];

  // Sort students by priority
  // 1. Prioritize students with fewer completed lessons
  const sortedStudentIds = [...params.studentIds].sort((aId, bId) => {
    const sA = students.find(s => s.id === aId);
    const sB = students.find(s => s.id === bId);
    if (!sA || !sB) return 0;
    return sA.completedSessions - sB.completedSessions; // Ascending (fewer lessons first)
  });

  const tempArrLessons = [...existingLessons];

  for (const studId of sortedStudentIds) {
    const studentObj = students.find(s => s.id === studId);
    if (!studentObj) continue;

    // Pick Instructor & vehicle
    let teacherId = params.instructorPref;
    if (teacherId === 'auto') {
      teacherId = studentObj.assignedInstructorId || instructors[0]?.id;
    }

    let carId = params.vehiclePref;
    if (carId === 'auto') {
      carId = studentObj.assignedVehicleId || vehicles[0]?.id;
    }

    // Begin date scanning
    let found = false;
    const dateStartObj = new Date(params.startDate);
    const dateEndObj = new Date(params.endDate);

    const checkLimitDays = Math.ceil((dateEndObj.getTime() - dateStartObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    for (let dayOffset = 0; dayOffset < checkLimitDays; dayOffset++) {
      const loopDateObj = new Date(dateStartObj);
      loopDateObj.setDate(loopDateObj.getDate() + dayOffset);
      const loopDateStr = loopDateObj.toISOString().split('T')[0];

      // Check if day is preferred
      let dayOfWeek = loopDateObj.getDay(); // 0 = Sun
      if (dayOfWeek === 0) dayOfWeek = 7; // Match with standard Việt working days
      if (params.preferredDays.length > 0 && !params.preferredDays.includes(dayOfWeek)) {
        continue;
      }

      // Try preferred time windows
      const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
      const timeRanges = params.preferredTimeRanges.length > 0
        ? params.preferredTimeRanges
        : [{ start: schoolHours.start, end: schoolHours.end }];

      for (const range of timeRanges) {
        const earliestMin = timeToMinutes(range.start);
        const latestMin = timeToMinutes(range.end);

        // Scan windows
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
            vehicles
          );

          if (!conflictCheck.hasConflict) {
            // Suggesting this slot!
            const newSug = {
              id: `sug_${Math.random().toString(36).substr(2, 9)}`,
              studentId: studId,
              instructorId: teacherId,
              vehicleId: carId,
              date: loopDateStr,
              startTime: candStart,
              endTime: candEnd,
              lessonType: (studentObj.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as any,
              warnings: []
            };

            suggestions.push(newSug);

            // Add to simulated pool so subsequent students won't book on same slot
            tempArrLessons.push({
              id: newSug.id,
              ...newSug,
              notes: 'Simulated automatic slot',
              status: 'Chờ xác nhận',
              attendanceStatus: 'Chưa điểm danh',
              resultNote: '',
              pickupLocation: studentObj.address,
              trainingLocation: 'Bãi tập Trung tâm'
            });

            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) break; // One lesson per student in this batch
    }

    if (!found) {
      // In case we could not automatically find ANY slot inside chosen dates/parameters
      // We will search next three free times for manual preview override
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
        settings
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
  durationMinutes: number, // e.g. 60, 90, 120
  existingLessons: Lesson[],
  settings: AppSettings
): { startTime: string; endTime: string; label: string }[] {
  const schoolHours = settings?.workingHours || { start: '07:00', end: '18:05' };
  const minStart = timeToMinutes(schoolHours.start);
  const minEnd = timeToMinutes(schoolHours.end);
  const freeSlots: { startTime: string; endTime: string; label: string }[] = [];

  for (let m = minStart; m + durationMinutes <= minEnd; m += 30) {
    const startStr = minutesToTime(m);
    const endStr = minutesToTime(m + durationMinutes);

    // See if the slot overlaps with any reserved schedules for this date
    let isReserved = false;
    for (const les of existingLessons) {
      if (les.status === 'Học viên báo nghỉ' || les.status === 'Giảng viên báo nghỉ' || les.status === 'Hủy lịch') {
        continue;
      }
      if (les.date === date) {
        // Overlaps?
        const overlaps = doIntervalsOverlap(startStr, endStr, les.startTime, les.endTime);
        if (overlaps) {
          if (les.instructorId === instructorId || les.vehicleId === vehicleId) {
            isReserved = true;
            break;
          }
        }
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
