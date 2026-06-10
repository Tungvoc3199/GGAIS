/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lesson, Instructor, Vehicle, AppSettings, Student } from '../types';
import { getZonedDateString, parseLocalDate } from '../utils/dateUtils';

/** Converts a time string "HH:mm" into minutes since start of day. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
}

/** Converts minutes since start of day back to a static "HH:mm" string. */
export function minutesToTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Determines if two time intervals overlap. */
export function doIntervalsOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const firstStart = timeToMinutes(start1);
  const firstEnd = timeToMinutes(end1);
  const secondStart = timeToMinutes(start2);
  const secondEnd = timeToMinutes(end2);
  return firstStart < secondEnd && secondStart < firstEnd;
}

interface ConflictResult {
  hasConflict: boolean;
  reasons: string[];
}

function getVietnamWeekday(dateString: string): number {
  const localDate = parseLocalDate(dateString);
  const day = localDate.getDay();
  return day === 0 ? 7 : day;
}

function isInactiveLesson(lesson: Lesson): boolean {
  return ['Học viên báo nghỉ', 'Giảng viên báo nghỉ', 'Hủy lịch'].includes(lesson.status);
}

/** Checks operational constraints and scheduling overlaps. */
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
  const startMinutes = timeToMinutes(newLesson.startTime);
  const endMinutes = timeToMinutes(newLesson.endTime);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return { hasConflict: true, reasons: ['Giờ kết thúc phải lớn hơn giờ bắt đầu.'] };
  }

  const student = students?.find(item => item.id === newLesson.studentId);
  const instructor = instructors.find(item => item.id === newLesson.instructorId);
  const vehicle = vehicles.find(item => item.id === newLesson.vehicleId);
  const bufferMinutes = Number(settings?.autoSchedulingRules?.safetyBufferMinutes || 0);
  const maxLessonsPerDay = Number(settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1);

  if (settings?.workingHours) {
    const schoolStart = timeToMinutes(settings.workingHours.start);
    const schoolEnd = timeToMinutes(settings.workingHours.end);
    if (startMinutes < schoolStart || endMinutes > schoolEnd) {
      reasons.push(`Ca học nằm ngoài giờ mở cửa (${settings.workingHours.start} - ${settings.workingHours.end}).`);
    }
  }

  if (instructor) {
    const instructorStart = timeToMinutes(instructor.workingHours.start);
    const instructorEnd = timeToMinutes(instructor.workingHours.end);

    if (!instructor.active) reasons.push(`Giảng viên ${instructor.name} đang ngưng hoạt động.`);
    if (startMinutes < instructorStart || endMinutes > instructorEnd) {
      reasons.push(`Ngoài khung giờ làm việc của GV ${instructor.name} (${instructor.workingHours.start} - ${instructor.workingHours.end}).`);
    }
    if (instructor.daysOff.includes(newLesson.date)) {
      reasons.push(`Giảng viên ${instructor.name} đang nghỉ phép vào ngày ${newLesson.date}.`);
    }

    const weekday = getVietnamWeekday(newLesson.date);
    if (!instructor.workingDays.includes(weekday)) {
      reasons.push(`Giảng viên ${instructor.name} không làm việc trong ngày đã chọn.`);
    }
  }

  if (vehicle && vehicle.status !== 'Sẵn sàng') {
    reasons.push(`Xe tập ${vehicle.name} (${vehicle.plate}) đang ở trạng thái: ${vehicle.status}.`);
  }

  if (student) {
    const sameStudentDayCount = existingLessons.filter(lesson =>
      lesson.studentId === newLesson.studentId
      && lesson.date === newLesson.date
      && lesson.id !== newLesson.id
      && !isInactiveLesson(lesson)
    ).length;

    if (sameStudentDayCount >= maxLessonsPerDay) {
      reasons.push(`Học viên ${student.name} đã đủ ${maxLessonsPerDay} ca trong ngày ${newLesson.date}.`);
    }

    if (instructor && !instructor.vehicleTypes.includes(student.licenseClass)) {
      reasons.push(`Giảng viên ${instructor.name} không phụ trách hạng ${student.licenseClass}.`);
    }

    if (vehicle) {
      if (vehicle.suitableLicenseClass && vehicle.suitableLicenseClass !== student.licenseClass) {
        reasons.push(`Xe ${vehicle.name} chỉ phù hợp hạng ${vehicle.suitableLicenseClass}.`);
      }
      if (student.licenseClass === 'B số tự động' && vehicle.transmission !== 'Số tự động') {
        reasons.push('Học viên B số tự động không được xếp xe số sàn.');
      }
      if ((student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && vehicle.transmission !== 'Số sàn') {
        reasons.push(`Học viên ${student.licenseClass} không được xếp xe số tự động.`);
      }
    }
  }

  for (const lesson of existingLessons) {
    if (lesson.id === newLesson.id || lesson.date !== newLesson.date || isInactiveLesson(lesson)) continue;

    const existingStart = timeToMinutes(lesson.startTime);
    const existingEnd = timeToMinutes(lesson.endTime);
    const overlapsWithBuffer = startMinutes < existingEnd + bufferMinutes && existingStart - bufferMinutes < endMinutes;
    if (!overlapsWithBuffer) continue;

    if (lesson.studentId === newLesson.studentId) {
      reasons.push(`Học viên bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${lesson.startTime} - ${lesson.endTime}.`);
    }
    if (lesson.instructorId === newLesson.instructorId) {
      reasons.push(`Giảng viên bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${lesson.startTime} - ${lesson.endTime}.`);
    }
    if (lesson.vehicleId === newLesson.vehicleId) {
      reasons.push(`Xe bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${lesson.startTime} - ${lesson.endTime}.`);
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  return { hasConflict: uniqueReasons.length > 0, reasons: uniqueReasons };
}

/** Suggests the next three available slots if a conflict occurs. */
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
  settings: AppSettings
): { date: string; startTime: string; endTime: string }[] {
  const suggestions: { date: string; startTime: string; endTime: string }[] = [];
  const startMinutes = timeToMinutes(settings.workingHours.start);
  const endMinutes = timeToMinutes(settings.workingHours.end);
  const currentDay = parseLocalDate(request.date);

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const dayString = getZonedDateString(currentDay);

    for (let minute = startMinutes; minute + request.duration <= endMinutes; minute += 30) {
      const startTime = minutesToTime(minute);
      const endTime = minutesToTime(minute + request.duration);
      const result = checkLessonConflicts(
        { ...request, date: dayString, startTime, endTime },
        existingLessons,
        instructors,
        vehicles,
        settings
      );

      if (!result.hasConflict) {
        suggestions.push({ date: dayString, startTime, endTime });
        if (suggestions.length >= 3) return suggestions;
      }
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return suggestions;
}

/** Auto-scheduling engine. One lesson is suggested per selected student. */
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
  const simulatedLessons = [...existingLessons];
  const sortedStudentIds = [...params.studentIds].sort((firstId, secondId) => {
    const first = students.find(item => item.id === firstId);
    const second = students.find(item => item.id === secondId);
    return Number(first?.completedSessions || 0) - Number(second?.completedSessions || 0);
  });

  for (const studentId of sortedStudentIds) {
    const student = students.find(item => item.id === studentId);
    if (!student) continue;

    const instructorId = params.instructorPref === 'auto'
      ? student.assignedInstructorId || instructors[0]?.id || ''
      : params.instructorPref;
    const vehicleId = params.vehiclePref === 'auto'
      ? student.assignedVehicleId || vehicles[0]?.id || ''
      : params.vehiclePref;

    const startDate = parseLocalDate(params.startDate);
    const endDate = parseLocalDate(params.endDate);
    const dayCount = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
    let found = false;

    for (let dayOffset = 0; dayOffset < dayCount && !found; dayOffset += 1) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      const dateString = getZonedDateString(date);
      const weekday = getVietnamWeekday(dateString);

      if (params.preferredDays.length > 0 && !params.preferredDays.includes(weekday)) continue;

      const timeRanges = params.preferredTimeRanges.length > 0
        ? params.preferredTimeRanges
        : [{ start: settings.workingHours.start, end: settings.workingHours.end }];

      for (const range of timeRanges) {
        const rangeStart = timeToMinutes(range.start);
        const rangeEnd = timeToMinutes(range.end);

        for (let minute = rangeStart; minute + params.duration <= rangeEnd; minute += 30) {
          const startTime = minutesToTime(minute);
          const endTime = minutesToTime(minute + params.duration);
          const result = checkLessonConflicts(
            { studentId, instructorId, vehicleId, date: dateString, startTime, endTime },
            simulatedLessons,
            instructors,
            vehicles,
            settings,
            students
          );

          if (result.hasConflict) continue;

          const suggestion = {
            id: `sug_${Math.random().toString(36).slice(2, 11)}`,
            studentId,
            instructorId,
            vehicleId,
            date: dateString,
            startTime,
            endTime,
            lessonType: (student.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as 'Sa hình' | 'Làm quen xe',
            warnings: []
          };

          suggestions.push(suggestion);
          simulatedLessons.push({
            ...suggestion,
            notes: 'Simulated automatic slot',
            status: 'Chờ xác nhận',
            attendanceStatus: 'Chưa điểm danh',
            resultNote: '',
            pickupLocation: student.address,
            trainingLocation: 'Bãi tập Trung tâm'
          });
          found = true;
          break;
        }

        if (found) break;
      }
    }

    if (!found) {
      const alternatives = suggestAvailableSlots(
        { studentId, instructorId, vehicleId, date: params.startDate, duration: params.duration },
        simulatedLessons,
        instructors,
        vehicles,
        settings
      );

      suggestions.push({
        id: `sug_err_${Math.random().toString(36).slice(2, 11)}`,
        studentId,
        instructorId,
        vehicleId,
        date: params.startDate,
        startTime: '08:00',
        endTime: minutesToTime(timeToMinutes('08:00') + params.duration),
        lessonType: 'Sa hình',
        warnings: [
          `Không tìm thấy khoảng trống phù hợp từ ${params.startDate} tới ${params.endDate}.`,
          alternatives.length > 0
            ? `Phương án thay thế: ${alternatives.map(item => `${item.startTime} - ${item.endTime} (${item.date})`).join(', ')}`
            : 'Đề xuất: Giảm điều kiện gán ép hoặc chọn tuần học khác.'
        ]
      });
    }
  }

  return { success: true, suggestions };
}
