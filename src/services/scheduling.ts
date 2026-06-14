/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson, Instructor, Vehicle, AppSettings, Student, LessonType } from '../types';

export type ScheduleSuggestion = { date: string; startTime: string; endTime: string };

const CANCELLED_LESSON_STATUSES = new Set(['Học viên báo nghỉ', 'Giảng viên báo nghỉ', 'Hủy lịch']);

function isActiveLesson(lesson: Pick<Lesson, 'status'>): boolean {
  return !CANCELLED_LESSON_STATUSES.has(lesson.status);
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons.filter(Boolean)));
}

export function normalizeDateInput(date: string): string | null {
  const raw = String(date || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
  }

  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const normalized = `${yyyy}-${String(Number(mm)).padStart(2, '0')}-${String(Number(dd)).padStart(2, '0')}`;
    return normalizeDateInput(normalized);
  }

  const vietnameseMatch = raw.match(/(?:ngày\s*)?(\d{1,2})\D+(\d{1,2})\D+(\d{4})/i);
  if (vietnameseMatch) {
    const [, dd, mm, yyyy] = vietnameseMatch;
    const normalized = `${yyyy}-${String(Number(mm)).padStart(2, '0')}-${String(Number(dd)).padStart(2, '0')}`;
    return normalizeDateInput(normalized);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function isValidDateString(date: string): boolean {
  return normalizeDateInput(date) !== null;
}

function isValidTimeString(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hour, minute] = time.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function weekdayLabel(day: number): string {
  const labels: Record<number, string> = {
    0: 'Chủ Nhật',
    1: 'Thứ 2',
    2: 'Thứ 3',
    3: 'Thứ 4',
    4: 'Thứ 5',
    5: 'Thứ 6',
    6: 'Thứ 7'
  };
  return labels[day] || `ngày ${day}`;
}

function getSchoolHours(settings?: AppSettings) {
  return {
    start: settings?.autoSchedulingRules?.workingHourStart || settings?.workingHours?.start || '07:00',
    end: settings?.autoSchedulingRules?.workingHourEnd || settings?.workingHours?.end || '18:00'
  };
}

function normalizeDuration(duration: number, settings?: AppSettings): number {
  const allowed = settings?.allowedDurations || [60, 90, 120];
  if (Number.isFinite(duration) && duration > 0) return duration;
  return settings?.defaultLessonDuration || allowed[0] || 120;
}

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
  const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes));
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
  return s1 < e2 && s2 < e1;
}

interface ConflictResult {
  hasConflict: boolean;
  reasons: string[];
}

function isInstructorCompatible(instructor: Instructor | undefined, student: Student | undefined): boolean {
  if (!instructor || !student) return false;
  return instructor.active !== false && (instructor.status ?? 'Đang dạy') === 'Đang dạy' && instructor.vehicleTypes.includes(student.licenseClass);
}

function isVehicleCompatible(vehicle: Vehicle | undefined, student: Student | undefined): boolean {
  if (!vehicle || !student) return false;
  if (vehicle.status !== 'Sẵn sàng') return false;
  if (vehicle.suitableLicenseClass && vehicle.suitableLicenseClass !== student.licenseClass) return false;
  if (student.licenseClass === 'B số tự động') return vehicle.transmission === 'Số tự động';
  if (student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') return vehicle.transmission === 'Số sàn';
  return true;
}

function chooseInstructor(student: Student, instructors: Instructor[], preferredId: string): string {
  if (preferredId !== 'auto') return preferredId;
  const assigned = instructors.find(i => i.id === student.assignedInstructorId && isInstructorCompatible(i, student));
  if (assigned) return assigned.id;
  const compatible = instructors.find(i => isInstructorCompatible(i, student));
  return compatible?.id || student.assignedInstructorId || instructors[0]?.id || '';
}

function chooseVehicle(student: Student, vehicles: Vehicle[], preferredId: string): string {
  if (preferredId !== 'auto') return preferredId;
  const assigned = vehicles.find(v => v.id === student.assignedVehicleId && isVehicleCompatible(v, student));
  if (assigned) return assigned.id;
  const compatible = vehicles.find(v => isVehicleCompatible(v, student));
  return compatible?.id || student.assignedVehicleId || vehicles[0]?.id || '';
}

function buildLessonType(student: Student): LessonType {
  if (student.licenseClass === 'A1' || student.licenseClass === 'A') return 'Làm quen xe';
  return 'Sa hình';
}

/**
 * Checks for scheduling conflicts for student, instructor, vehicle, working hours,
 * training compatibility and daily lesson limits.
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
  students?: Student[]
): ConflictResult {
  const reasons: string[] = [];
  const normalizedDate = normalizeDateInput(newLesson.date);

  if (!newLesson.studentId) reasons.push('Chưa chọn học viên.');
  if (!newLesson.instructorId) reasons.push('Chưa chọn giảng viên.');
  if (!newLesson.vehicleId) reasons.push('Chưa chọn xe tập lái.');
  if (!normalizedDate) reasons.push('Ngày học không hợp lệ.');
  if (!isValidTimeString(newLesson.startTime) || !isValidTimeString(newLesson.endTime)) {
    reasons.push('Giờ học phải có định dạng HH:mm hợp lệ.');
  }

  if (reasons.length > 0 || !normalizedDate) {
    return { hasConflict: true, reasons: uniqueReasons(reasons) };
  }

  const startM = timeToMinutes(newLesson.startTime);
  const endM = timeToMinutes(newLesson.endTime);

  if (endM <= startM) {
    reasons.push('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
    return { hasConflict: true, reasons: uniqueReasons(reasons) };
  }

  const duration = endM - startM;
  if (duration < 30) reasons.push('Một buổi học phải kéo dài tối thiểu 30 phút.');
  if (duration > 300) reasons.push('Một buổi học không nên kéo dài quá 5 giờ. Hãy tách thành nhiều ca.');

  const schoolHours = getSchoolHours(settings);
  const schoolStartM = timeToMinutes(schoolHours.start);
  const schoolEndM = timeToMinutes(schoolHours.end);
  if (startM < schoolStartM || endM > schoolEndM) {
    reasons.push(`Lịch học nằm ngoài khung giờ hoạt động của trung tâm (${schoolHours.start} - ${schoolHours.end}).`);
  }

  const student = students?.find(s => s.id === newLesson.studentId);
  const teacher = instructors.find(i => i.id === newLesson.instructorId);
  const car = vehicles.find(v => v.id === newLesson.vehicleId);
  const buffer = Math.max(0, settings?.autoSchedulingRules?.safetyBufferMinutes || 0);
  const maxDayLessons = Math.max(1, settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1);

  if (student) {
    if (student.status === 'Tạm dừng') {
      reasons.push(`Học viên ${student.name} đang tạm dừng, không nên xếp lịch mới.`);
    }
    if (student.status === 'Đã hoàn thành' || student.status === 'Đã thi') {
      reasons.push(`Học viên ${student.name} đã ở trạng thái ${student.status}, cần kiểm tra trước khi xếp thêm lịch.`);
    }
    if ((student.remainingSessions ?? 0) <= 0) {
      reasons.push(`Học viên ${student.name} đã hết số buổi còn lại trong gói học.`);
    }
  }

  if (!teacher) {
    reasons.push('Không tìm thấy thông tin giảng viên được chọn.');
  } else {
    if (teacher.active === false || (teacher.status && teacher.status !== 'Đang dạy')) {
      reasons.push(`Giảng viên ${teacher.name} không ở trạng thái đang dạy.`);
    }

    const teachHours = teacher.workingHours || { start: schoolHours.start, end: schoolHours.end };
    const teachStart = timeToMinutes(teachHours.start);
    const teachEnd = timeToMinutes(teachHours.end);
    if (startM < teachStart || endM > teachEnd) {
      reasons.push(`Ngoài khung giờ làm việc của GV ${teacher.name} (${teachHours.start} - ${teachHours.end}).`);
    }

    if ((teacher.daysOff || []).includes(normalizedDate)) {
      reasons.push(`Giảng viên ${teacher.name} đang nghỉ phép vào ngày ${normalizedDate}.`);
    }

    const lessonDateObj = new Date(`${normalizedDate}T00:00:00`);
    const dayOfWeek = lessonDateObj.getDay();
    const workingDays = teacher.workingDays || [];
    if (workingDays.length > 0 && !workingDays.includes(dayOfWeek)) {
      reasons.push(`Giảng viên ${teacher.name} không làm việc vào ${weekdayLabel(dayOfWeek)}.`);
    }
  }

  if (!car) {
    reasons.push('Không tìm thấy thông tin xe tập lái được chọn.');
  } else if (car.status !== 'Sẵn sàng') {
    reasons.push(`Xe tập ${car.name} (${car.plate}) đang ở trạng thái: ${car.status}.`);
  }

  if (student && teacher && !teacher.vehicleTypes.includes(student.licenseClass)) {
    reasons.push(`Giảng viên ${teacher.name} chưa được gán dạy hạng ${student.licenseClass}.`);
  }

  if (student && car) {
    if (car.suitableLicenseClass && car.suitableLicenseClass !== student.licenseClass) {
      reasons.push(`Xe tập ${car.name} (${car.plate}) chỉ phù hợp đào tạo hạng ${car.suitableLicenseClass}, học viên ký hạng ${student.licenseClass}.`);
    }

    if (student.licenseClass === 'B số tự động' && car.transmission !== 'Số tự động') {
      reasons.push('Học viên B số tự động không được xếp tập trên xe số sàn.');
    } else if ((student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && car.transmission !== 'Số sàn') {
      reasons.push(`Học viên ${student.licenseClass} cần xe số sàn, không được xếp xe số tự động.`);
    }
  }

  if (student) {
    const studentLessonsOnDay = existingLessons.filter(l =>
      l.studentId === newLesson.studentId &&
      normalizeDateInput(l.date) === normalizedDate &&
      l.id !== newLesson.id &&
      isActiveLesson(l)
    );

    if (studentLessonsOnDay.length >= maxDayLessons) {
      reasons.push(`Học viên ${student.name} đã đạt giới hạn ${maxDayLessons} ca học trong ngày ${normalizedDate}.`);
    }
  }

  for (const lesson of existingLessons) {
    if (lesson.id === newLesson.id) continue;
    if (!isActiveLesson(lesson)) continue;
    if (normalizeDateInput(lesson.date) !== normalizedDate) continue;

    const itemStartM = timeToMinutes(lesson.startTime);
    const itemEndM = timeToMinutes(lesson.endTime);
    const overlap = startM < itemEndM && itemStartM < endM;
    const bufferOverlap = buffer > 0 && startM < itemEndM + buffer && itemStartM - buffer < endM;

    if (!overlap && !bufferOverlap) continue;

    if (lesson.studentId === newLesson.studentId) {
      if (overlap) reasons.push(`Học viên đã bận lịch học khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
      else reasons.push(`Khoảng nghỉ của học viên giữa các ca chưa đạt tối thiểu ${buffer} phút (${lesson.startTime} - ${lesson.endTime}).`);
    }

    if (lesson.instructorId === newLesson.instructorId) {
      if (overlap) reasons.push(`Giảng viên bận dạy lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
      else reasons.push(`Giảng viên cần nghỉ tối thiểu ${buffer} phút giữa hai ca (${lesson.startTime} - ${lesson.endTime}).`);
    }

    if (lesson.vehicleId === newLesson.vehicleId) {
      if (overlap) reasons.push(`Xe tập lái (${car?.plate || 'phân công'}) đã bận lịch khác trùng giờ (${lesson.startTime} - ${lesson.endTime}).`);
      else reasons.push(`Xe tập lái cần khoảng nghỉ tối thiểu ${buffer} phút trước ca tiếp theo (${lesson.startTime} - ${lesson.endTime}).`);
    }
  }

  return {
    hasConflict: reasons.length > 0,
    reasons: uniqueReasons(reasons)
  };
}

/**
 * Suggests the next available slots if a conflict occurs.
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
  students?: Student[]
): ScheduleSuggestion[] {
  const suggestions: ScheduleSuggestion[] = [];
  const schoolHours = getSchoolHours(settings);
  const startMinutes = timeToMinutes(schoolHours.start);
  const endMinutes = timeToMinutes(schoolHours.end);
  const duration = normalizeDuration(request.duration, settings);
  const normalizedRequestDate = normalizeDateInput(request.date) || new Date().toISOString().slice(0, 10);

  let currentDay = new Date(`${normalizedRequestDate}T00:00:00`);
  if (Number.isNaN(currentDay.getTime())) currentDay = new Date();

  for (let d = 0; d < 14; d++) {
    const dayStr = currentDay.toISOString().slice(0, 10);

    for (let min = startMinutes; min + duration <= endMinutes; min += 30) {
      const candStart = minutesToTime(min);
      const candEnd = minutesToTime(min + duration);

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
        students
      );

      if (!check.hasConflict) {
        suggestions.push({ date: dayStr, startTime: candStart, endTime: candEnd });
        if (suggestions.length >= 5) return suggestions;
      }
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return suggestions;
}

/**
 * Reusable Auto-Scheduling Wizard Engine.
 * Prioritizes students with fewer completed lessons and allocates compatible instructor/vehicle slots.
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
  const suggestions: any[] = [];
  const duration = normalizeDuration(params.duration, settings);
  const normalizedStartDate = normalizeDateInput(params.startDate) || new Date().toISOString().slice(0, 10);
  const normalizedEndDate = normalizeDateInput(params.endDate) || normalizedStartDate;
  const dateStartObj = new Date(`${normalizedStartDate}T00:00:00`);
  const dateEndObj = new Date(`${normalizedEndDate}T00:00:00`);

  if (Number.isNaN(dateStartObj.getTime()) || Number.isNaN(dateEndObj.getTime()) || dateEndObj < dateStartObj) {
    return {
      success: false,
      suggestions: [{
        id: `sug_err_${Math.random().toString(36).slice(2, 11)}`,
        studentId: params.studentIds[0] || '',
        instructorId: params.instructorPref,
        vehicleId: params.vehiclePref,
        date: normalizedStartDate,
        startTime: '08:00',
        endTime: minutesToTime(timeToMinutes('08:00') + duration),
        lessonType: 'Sa hình',
        warnings: ['Khoảng ngày xếp lịch không hợp lệ. Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.']
      }]
    };
  }

  const sortedStudentIds = [...params.studentIds].sort((aId, bId) => {
    const sA = students.find(s => s.id === aId);
    const sB = students.find(s => s.id === bId);
    if (!sA || !sB) return 0;
    return (sA.completedSessions || 0) - (sB.completedSessions || 0);
  });

  const tempArrLessons = [...existingLessons];
  const checkLimitDays = Math.ceil((dateEndObj.getTime() - dateStartObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  for (const studId of sortedStudentIds) {
    const studentObj = students.find(s => s.id === studId);
    if (!studentObj) continue;

    const warningNotes: string[] = [];
    const teacherPool = params.instructorPref === 'auto'
      ? instructors.filter(i => isInstructorCompatible(i, studentObj))
      : instructors.filter(i => i.id === params.instructorPref);
    const vehiclePool = params.vehiclePref === 'auto'
      ? vehicles.filter(v => isVehicleCompatible(v, studentObj))
      : vehicles.filter(v => v.id === params.vehiclePref);

    const assignedTeacherId = chooseInstructor(studentObj, instructors, params.instructorPref);
    const assignedVehicleId = chooseVehicle(studentObj, vehicles, params.vehiclePref);
    const candidateTeachers = teacherPool.length > 0 ? teacherPool : instructors.filter(i => i.id === assignedTeacherId);
    const candidateVehicles = vehiclePool.length > 0 ? vehiclePool : vehicles.filter(v => v.id === assignedVehicleId);

    if (candidateTeachers.length === 0) warningNotes.push(`Không có giảng viên phù hợp hạng ${studentObj.licenseClass}.`);
    if (candidateVehicles.length === 0) warningNotes.push(`Không có xe phù hợp hạng ${studentObj.licenseClass}.`);

    let found = false;

    for (let dayOffset = 0; dayOffset < checkLimitDays && !found; dayOffset++) {
      const loopDateObj = new Date(dateStartObj);
      loopDateObj.setDate(loopDateObj.getDate() + dayOffset);
      const loopDateStr = loopDateObj.toISOString().slice(0, 10);
      const dayOfWeek = loopDateObj.getDay();

      if (params.preferredDays.length > 0 && !params.preferredDays.includes(dayOfWeek)) continue;

      const schoolHours = getSchoolHours(settings);
      const timeRanges = params.preferredTimeRanges.length > 0
        ? params.preferredTimeRanges
        : [{ start: schoolHours.start, end: schoolHours.end }];

      for (const range of timeRanges) {
        if (found) break;
        const earliestMin = timeToMinutes(range.start);
        const latestMin = timeToMinutes(range.end);

        for (let tMin = earliestMin; tMin + duration <= latestMin && !found; tMin += 30) {
          const candStart = minutesToTime(tMin);
          const candEnd = minutesToTime(tMin + duration);

          for (const teacher of candidateTeachers) {
            if (found) break;
            for (const vehicle of candidateVehicles) {
              const conflictCheck = checkLessonConflicts(
                {
                  studentId: studId,
                  instructorId: teacher.id,
                  vehicleId: vehicle.id,
                  date: loopDateStr,
                  startTime: candStart,
                  endTime: candEnd
                },
                tempArrLessons,
                instructors,
                vehicles,
                settings,
                students
              );

              if (!conflictCheck.hasConflict) {
                const newSug = {
                  id: `sug_${Math.random().toString(36).slice(2, 11)}`,
                  studentId: studId,
                  instructorId: teacher.id,
                  vehicleId: vehicle.id,
                  date: loopDateStr,
                  startTime: candStart,
                  endTime: candEnd,
                  lessonType: buildLessonType(studentObj),
                  warnings: warningNotes
                };

                suggestions.push(newSug);
                tempArrLessons.push({
                  id: newSug.id,
                  studentId: newSug.studentId,
                  instructorId: newSug.instructorId,
                  vehicleId: newSug.vehicleId,
                  date: newSug.date,
                  startTime: newSug.startTime,
                  endTime: newSug.endTime,
                  lessonType: newSug.lessonType,
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
          }
        }
      }
    }

    if (!found) {
      const fallbackTeacherId = assignedTeacherId || candidateTeachers[0]?.id || '';
      const fallbackVehicleId = assignedVehicleId || candidateVehicles[0]?.id || '';
      const altOptions = suggestAvailableSlots(
        {
          studentId: studId,
          instructorId: fallbackTeacherId,
          vehicleId: fallbackVehicleId,
          date: normalizedStartDate,
          duration
        },
        tempArrLessons,
        instructors,
        vehicles,
        settings,
        students
      );

      suggestions.push({
        id: `sug_err_${Math.random().toString(36).slice(2, 11)}`,
        studentId: studId,
        instructorId: fallbackTeacherId,
        vehicleId: fallbackVehicleId,
        date: normalizedStartDate,
        startTime: '08:00',
        endTime: minutesToTime(timeToMinutes('08:00') + duration),
        lessonType: buildLessonType(studentObj),
        warnings: [
          ...warningNotes,
          `Không tìm thấy khoảng thời gian trống phù hợp cho ${studentObj.name} từ ${normalizedStartDate} tới ${normalizedEndDate}.`,
          altOptions.length > 0
            ? `Phương án thay thế: ${altOptions.map(o => `${o.startTime} - ${o.endTime} (${o.date})`).join(', ')}`
            : 'Đề xuất: mở rộng khoảng ngày, đổi giáo viên/xe hoặc giảm ràng buộc giờ học.'
        ]
      });
    }
  }

  return { success: true, suggestions };
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
  const schoolHours = getSchoolHours(settings);
  const minStart = timeToMinutes(schoolHours.start);
  const minEnd = timeToMinutes(schoolHours.end);
  const duration = normalizeDuration(durationMinutes, settings);
  const freeSlots: { startTime: string; endTime: string; label: string }[] = [];
  const normalizedDate = normalizeDateInput(date) || date;

  for (let m = minStart; m + duration <= minEnd; m += 30) {
    const startStr = minutesToTime(m);
    const endStr = minutesToTime(m + duration);

    let isReserved = false;
    for (const les of existingLessons) {
      if (!isActiveLesson(les)) continue;
      if (normalizeDateInput(les.date) !== normalizedDate) continue;
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
