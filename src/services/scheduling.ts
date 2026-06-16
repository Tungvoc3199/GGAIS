import { Lesson, Instructor, Vehicle, AppSettings, Student } from '../types';

export function timeToMinutes(time: string): number {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function doIntervalsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

type ConflictResult = { hasConflict: boolean; reasons: string[] };
type ConflictOptions = { enforceSafetyBuffer?: boolean };

function isActiveLesson(lesson: Lesson): boolean {
  return !['Học viên báo nghỉ', 'Giảng viên báo nghỉ', 'Hủy lịch'].includes(lesson.status);
}

function unique(reasons: string[]) {
  return Array.from(new Set(reasons.filter(Boolean)));
}

function isTeacherOk(instructor?: Instructor): boolean {
  if (!instructor) return false;
  if (instructor.active === false) return false;
  const status = String(instructor.status || '').toLowerCase();
  return !['tạm nghỉ', 'nghỉ việc', 'ngừng'].some(k => status.includes(k));
}

function isCarOk(vehicle?: Vehicle): boolean {
  if (!vehicle) return false;
  const status = String(vehicle.status || '').toLowerCase();
  return !['bảo dưỡng', 'ngừng'].some(k => status.includes(k));
}

export function checkLessonConflicts(
  newLesson: { studentId: string; instructorId: string; vehicleId: string; date: string; startTime: string; endTime: string; id?: string },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings?: AppSettings,
  students?: Student[],
  options: ConflictOptions = {}
): ConflictResult {
  const reasons: string[] = [];
  const startM = timeToMinutes(newLesson.startTime);
  const endM = timeToMinutes(newLesson.endTime);
  const student = students?.find(s => s.id === newLesson.studentId);
  const teacher = instructors.find(i => i.id === newLesson.instructorId);
  const car = vehicles.find(v => v.id === newLesson.vehicleId);

  if (!newLesson.studentId) reasons.push('Chưa chọn học viên.');
  if (!newLesson.instructorId) reasons.push('Chưa chọn giảng viên.');
  if (!newLesson.vehicleId) reasons.push('Chưa chọn xe tập lái.');
  if (!newLesson.date) reasons.push('Ngày học không hợp lệ.');
  if (endM <= startM) reasons.push('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
  if (!teacher) reasons.push('Không tìm thấy giảng viên.');
  if (teacher && !isTeacherOk(teacher)) reasons.push(`Giảng viên ${teacher.name} không ở trạng thái hoạt động.`);
  if (!car) reasons.push('Không tìm thấy xe tập lái.');
  if (car && !isCarOk(car)) reasons.push(`Xe tập ${car.name} (${car.plate}) chưa đủ điều kiện vận hành.`);

  if (student && teacher && !teacher.vehicleTypes.includes(student.licenseClass)) reasons.push(`Giảng viên ${teacher.name} chưa được gán dạy hạng ${student.licenseClass}.`);
  if (student && car && car.suitableLicenseClass && car.suitableLicenseClass !== student.licenseClass) reasons.push(`Xe ${car.plate} không phù hợp hạng ${student.licenseClass}.`);
  if (student && car && student.licenseClass === 'B số tự động' && car.transmission !== 'Số tự động') reasons.push('Học viên B số tự động cần xe số tự động.');
  if (student && car && (student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && car.transmission !== 'Số sàn') reasons.push(`Học viên ${student.licenseClass} cần xe số sàn.`);

  const buffer = options.enforceSafetyBuffer ? (settings?.autoSchedulingRules?.safetyBufferMinutes || 0) : 0;
  for (const lesson of existingLessons) {
    if (lesson.id === newLesson.id || !isActiveLesson(lesson) || lesson.date !== newLesson.date) continue;
    const lessonStartM = timeToMinutes(lesson.startTime);
    const lessonEndM = timeToMinutes(lesson.endTime);
    const overlap = startM < lessonEndM && lessonStartM < endM;
    const bufferOverlap = buffer > 0 && startM < lessonEndM + buffer && lessonStartM - buffer < endM;
    if (!overlap && !bufferOverlap) continue;
    if (lesson.studentId === newLesson.studentId) reasons.push(overlap ? `Học viên đã bận lịch khác (${lesson.startTime} - ${lesson.endTime}).` : `Học viên chưa đủ khoảng nghỉ tự động ${buffer} phút.`);
    if (lesson.instructorId === newLesson.instructorId) reasons.push(overlap ? `Giảng viên bận lịch khác (${lesson.startTime} - ${lesson.endTime}).` : `Giảng viên chưa đủ khoảng nghỉ tự động ${buffer} phút.`);
    if (lesson.vehicleId === newLesson.vehicleId) reasons.push(overlap ? `Xe tập lái đã bận lịch khác (${lesson.startTime} - ${lesson.endTime}).` : `Xe tập lái chưa đủ khoảng nghỉ tự động ${buffer} phút.`);
  }

  return { hasConflict: reasons.length > 0, reasons: unique(reasons) };
}

export function suggestAvailableSlots(
  request: { studentId: string; instructorId: string; vehicleId: string; date: string; duration: number },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings,
  students?: Student[],
  options: ConflictOptions = {}
): { date: string; startTime: string; endTime: string }[] {
  const suggestions: { date: string; startTime: string; endTime: string }[] = [];
  const hours = settings?.workingHours || { start: '07:00', end: '18:00' };
  const currentDay = new Date(request.date);
  for (let d = 0; d < 7; d++) {
    const date = currentDay.toISOString().split('T')[0];
    for (let m = timeToMinutes(hours.start); m + request.duration <= timeToMinutes(hours.end); m += 30) {
      const startTime = minutesToTime(m);
      const endTime = minutesToTime(m + request.duration);
      const check = checkLessonConflicts({ ...request, date, startTime, endTime }, existingLessons, instructors, vehicles, settings, students, options);
      if (!check.hasConflict) {
        suggestions.push({ date, startTime, endTime });
        if (suggestions.length >= 3) return suggestions;
      }
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }
  return suggestions;
}

export function runAutoSchedulingEngine(
  params: { studentIds: string[]; startDate: string; endDate: string; duration: number; preferredDays: number[]; preferredTimeRanges: { start: string; end: string }[]; instructorPref: string; vehiclePref: string },
  students: Student[],
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings
): { success: boolean; suggestions: { id: string; studentId: string; instructorId: string; vehicleId: string; date: string; startTime: string; endTime: string; lessonType: 'Sa hình' | 'Đường trường cơ bản' | 'Làm quen xe'; warnings: string[] }[] } {
  const suggestions: any[] = [];
  const tempLessons = [...existingLessons];
  const start = new Date(params.startDate);
  const end = new Date(params.endDate);
  const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const options = { enforceSafetyBuffer: true };

  for (const studentId of params.studentIds) {
    const student = students.find(s => s.id === studentId);
    if (!student) continue;
    const instructorId = params.instructorPref === 'auto' ? (student.assignedInstructorId || instructors[0]?.id || '') : params.instructorPref;
    const vehicleId = params.vehiclePref === 'auto' ? (student.assignedVehicleId || vehicles[0]?.id || '') : params.vehiclePref;
    let placed = false;

    for (let d = 0; d < dayCount && !placed; d++) {
      const dateObj = new Date(start);
      dateObj.setDate(start.getDate() + d);
      const date = dateObj.toISOString().split('T')[0];
      if (params.preferredDays.length > 0 && !params.preferredDays.includes(dateObj.getDay())) continue;
      const ranges = params.preferredTimeRanges.length > 0 ? params.preferredTimeRanges : [settings?.workingHours || { start: '07:00', end: '18:00' }];
      for (const range of ranges) {
        for (let m = timeToMinutes(range.start); m + params.duration <= timeToMinutes(range.end); m += 30) {
          const startTime = minutesToTime(m);
          const endTime = minutesToTime(m + params.duration);
          const check = checkLessonConflicts({ studentId, instructorId, vehicleId, date, startTime, endTime }, tempLessons, instructors, vehicles, settings, students, options);
          if (!check.hasConflict) {
            const item = { id: `sug_${Math.random().toString(36).slice(2, 11)}`, studentId, instructorId, vehicleId, date, startTime, endTime, lessonType: (student.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as any, warnings: [] };
            suggestions.push(item);
            tempLessons.push({ ...item, notes: 'Simulated automatic slot', status: 'Chờ xác nhận', attendanceStatus: 'Chưa điểm danh', resultNote: '', pickupLocation: student.address, trainingLocation: 'Bãi tập Trung tâm' });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
  }
  return { success: true, suggestions };
}

export function getFreeSlotsReport(date: string, instructorId: string, vehicleId: string, durationMinutes: number, existingLessons: Lesson[], settings: AppSettings): { startTime: string; endTime: string; label: string }[] {
  const hours = settings?.workingHours || { start: '07:00', end: '18:05' };
  const slots: { startTime: string; endTime: string; label: string }[] = [];
  for (let m = timeToMinutes(hours.start); m + durationMinutes <= timeToMinutes(hours.end); m += 30) {
    const startTime = minutesToTime(m);
    const endTime = minutesToTime(m + durationMinutes);
    const reserved = existingLessons.some(l => isActiveLesson(l) && l.date === date && doIntervalsOverlap(startTime, endTime, l.startTime, l.endTime) && (l.instructorId === instructorId || l.vehicleId === vehicleId));
    if (!reserved) slots.push({ startTime, endTime, label: `${startTime} - ${endTime}` });
  }
  return slots;
}
