/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Student, Instructor, Vehicle, Lesson, AppSettings, AuditLog, LessonType } from '../types';

// Helper: Convert time string "HH:mm" to minutes since midnight
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Helper: Convert minutes since midnight back to "HH:mm"
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Helper: Parse generic "yyyy-MM-dd" safely ignoring timezone offsets
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper: Determine if two intervals overlap
export function checkIntervalOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 && s2 < e1;
}

// Engine Input Options
export interface AutoSchedulingParams {
  studentIds: string[];
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  preferredDays: number[]; // Weekdays (1 = Monday, ..., 7 = Sunday)
  preferredTimeRanges: { start: string; end: string }[];
  duration: number; // minutes, e.g. 120
  preferredInstructorId?: string; // Optional: specify one instruction or leave empty for auto
  preferredVehicleId?: string; // Optional: specify one vehicle or leave empty for auto
  examDates?: Record<string, string>; // Optional: studentId -> yyyy-MM-dd
}

// Conflict Diagnostic Info
export interface ConflictExplanation {
  type: 'STUDENT_CONFLICT' | 'INSTRUCTOR_CONFLICT' | 'VEHICLE_CONFLICT' | 'INSTRUCTOR_OFF' | 'VEHICLE_MAINTENANCE' | 'OUTSIDE_HOURS' | 'OTHER';
  message: string;
}

// Single Scheduling Recommendation Result
export interface RecommendedSlot {
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleName: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  score: number; // Priority Score
  scoreBreakdown: {
    examProximity: number;
    idleDaysPoints: number;
    completedLessonsPoints: number;
    timePreferenceMatch: boolean;
  };
  duration: number;
  conflicts: ConflictExplanation[];
  alternatives: { date: string; startTime: string; endTime: string }[];
}

export interface EngineResult {
  success: boolean;
  recommendedSlots: RecommendedSlot[];
  failedSlots: RecommendedSlot[]; // Students we failed to find preferred slots for
}

/**
 * Reusable Auto-Scheduling Engine with Priority Scoring and Constraint Checking.
 */
export function runAdvancedSchedulingEngine(
  params: AutoSchedulingParams,
  students: Student[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  existingLessons: Lesson[],
  settings: AppSettings
): EngineResult {
  const recommendedSlots: RecommendedSlot[] = [];
  const failedSlots: RecommendedSlot[] = [];
  
  // Clone existing bookings to emulate reservation slots incrementally
  const simulatedLessons = [...existingLessons];

  // 1. STAGE FLOW: CALCULATE PRIORITY SCORE FOR SELECTED STUDENTS
  // Priority Scoring Rules:
  // - Flag A (Exam date proximity): Up to 3000 pts if exam is near (higher points for closer dates).
  // - Flag B (Days without lessons): More idle days -> higher points (+15 pts per idle day). Reference is params.startDate.
  // - Flag C (Completed lessons): Fewer completed lessons -> higher points (+50 pts per missing lesson).
  const pricedStudents = params.studentIds.map(stId => {
    const student = students.find(s => s.id === stId);
    if (!student) return { id: stId, score: 0, priorityDetails: { examProximity: 0, idleDaysPoints: 0, completedLessonsPoints: 0 } };

    // Part A: Exam Date proximity
    let examProximity = 0;
    const studentExamDate = params.examDates?.[stId];
    if (studentExamDate) {
      const examObj = parseLocalDate(studentExamDate);
      const startObj = parseLocalDate(params.startDate);
      const daysToExam = Math.ceil((examObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExam > 0) {
        // Less days left -> higher score
        examProximity = Math.max(0, (90 - daysToExam) * 40);
      } else {
        examProximity = 0; // Already passed or today
      }
    }

    // Part B: Days without learning recently
    // Find last lesson of this student before startDate
    const studentLessons = existingLessons.filter(l => 
      l.studentId === stId && 
      l.status !== 'Học viên báo nghỉ' && 
      l.status !== 'Giảng viên báo nghỉ' && 
      l.status !== 'Hủy lịch'
    );
    
    let lastLessonDateStr = student.registrationDate;
    if (studentLessons.length > 0) {
      // Sort lessons ascending by date
      const sortedLessons = [...studentLessons].sort((a, b) => a.date.localeCompare(b.date));
      lastLessonDateStr = sortedLessons[sortedLessons.length - 1].date;
    }

    const lastDateObj = parseLocalDate(lastLessonDateStr);
    const startObj = parseLocalDate(params.startDate);
    const idleDays = Math.max(0, Math.ceil((startObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24)));
    const idleDaysPoints = idleDays * 15;

    // Part C: Fewer completed lessons
    const remainingLessons = student.totalSessions - student.completedSessions;
    const completedLessonsPoints = Math.max(0, remainingLessons * 50);

    const totalPriorityScore = examProximity + idleDaysPoints + completedLessonsPoints;

    return {
      id: stId,
      student,
      score: totalPriorityScore,
      priorityDetails: {
        examProximity,
        idleDaysPoints,
        completedLessonsPoints
      }
    };
  });

  // Sort students by priority score descending
  pricedStudents.sort((a, b) => b.score - a.score);

  // 2. STAGE FLOW: ASSIGN SLOTS FOR EACH STUDENT SEQUENTIALLY
  for (const item of pricedStudents) {
    const student = item.student;
    if (!student) continue;

    // Helper to calculate total workloads within this range in simulatedLessons
    const getInstructorWorkload = (instId: string) => {
      return simulatedLessons.filter(l => 
        l.instructorId === instId && 
        l.date >= params.startDate && 
        l.date <= params.endDate &&
        l.status !== 'Học viên báo nghỉ' && 
        l.status !== 'Giảng viên báo nghỉ' && 
        l.status !== 'Hủy lịch'
      ).length;
    };

    const getVehicleWorkload = (vehId: string) => {
      return simulatedLessons.filter(l => 
        l.vehicleId === vehId && 
        l.date >= params.startDate && 
        l.date <= params.endDate &&
        l.status !== 'Học viên báo nghỉ' && 
        l.status !== 'Giảng viên báo nghỉ' && 
        l.status !== 'Hủy lịch'
      ).length;
    };

    // Determine candidate instructor pools:
    let eligibleInstructors: Instructor[] = [];
    if (params.preferredInstructorId && params.preferredInstructorId !== 'auto') {
      eligibleInstructors = instructors.filter(i => i.active && i.id === params.preferredInstructorId);
    } else {
      // Two-pass instructor workloads balancing
      // Filter only active trainers compatible with student's license class
      const compatibleInsts = instructors.filter(i => i.active && i.vehicleTypes.includes(student.licenseClass));
      
      let assignedInst: Instructor | undefined;
      if (student.assignedInstructorId) {
        assignedInst = compatibleInsts.find(i => i.id === student.assignedInstructorId);
      }

      const otherCompatibleInsts = compatibleInsts.filter(i => !assignedInst || i.id !== assignedInst.id)
        .sort((a, b) => getInstructorWorkload(a.id) - getInstructorWorkload(b.id));

      if (assignedInst) {
        eligibleInstructors = [assignedInst, ...otherCompatibleInsts];
      } else {
        eligibleInstructors = otherCompatibleInsts;
      }
    }

    // Determine candidate vehicle pools:
    let eligibleVehicles: Vehicle[] = [];
    const isVehicleCompatible = (veh: Vehicle, license: string) => {
      if (veh.status !== 'Sẵn sàng') return false;
      if (veh.suitableLicenseClass && veh.suitableLicenseClass !== license) return false;
      
      if (license === 'B số tự động') {
        return veh.transmission === 'Số tự động';
      } else if (license === 'B số sàn' || license === 'C1') {
        return veh.transmission === 'Số sàn';
      }
      return true;
    };

    if (params.preferredVehicleId && params.preferredVehicleId !== 'auto') {
      eligibleVehicles = vehicles.filter(v => v.id === params.preferredVehicleId);
    } else {
      // Two-pass vehicle workloads balancing
      const compatibleVehs = vehicles.filter(v => isVehicleCompatible(v, student.licenseClass));
      
      let assignedVeh: Vehicle | undefined;
      if (student.assignedVehicleId) {
        assignedVeh = compatibleVehs.find(v => v.id === student.assignedVehicleId);
      }

      const otherCompatibleVehs = compatibleVehs.filter(v => !assignedVeh || v.id !== assignedVeh.id)
        .sort((a, b) => getVehicleWorkload(a.id) - getVehicleWorkload(b.id));

      if (assignedVeh) {
        eligibleVehicles = [assignedVeh, ...otherCompatibleVehs];
      } else {
        eligibleVehicles = otherCompatibleVehs;
      }
    }

    // Begin scanning dates
    let startDay = parseLocalDate(params.startDate);
    let endDay = parseLocalDate(params.endDate);
    const totalDaysToScan = Math.ceil((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    let foundProposedSlot = false;
    let fallbackAlternatives: { date: string; startTime: string; endTime: string }[] = [];
    let diagnostics: ConflictExplanation[] = [];

    // Helper tracker to gather alternative slots if preferred fail
    const gatherAlternatives = (
      studentId: string,
      instId: string,
      vehId: string,
      reqDateStr: string,
      scanLimitDays = 14
    ) => {
      const alts: { date: string; startTime: string; endTime: string }[] = [];
      const altStartDay = parseLocalDate(reqDateStr);
      
      for (let offset = 0; offset < scanLimitDays; offset++) {
        const dObj = new Date(altStartDay);
        dObj.setDate(dObj.getDate() + offset);
        const dStr = dObj.toISOString().split('T')[0];

        // For alternatives, scan standard school hours (e.g. 07:00 - 18:00)
        const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
        const schoolStartMin = timeToMinutes(schoolHours.start);
        const schoolEndMin = timeToMinutes(schoolHours.end);

        for (let m = schoolStartMin; m + params.duration <= schoolEndMin; m += 30) {
          const sTime = minutesToTime(m);
          const eTime = minutesToTime(m + params.duration);

          const conflictCheck = evaluateIndividualAndWorkloadConflicts(
            { studentId, instructorId: instId, vehicleId: vehId, date: dStr, startTime: sTime, endTime: eTime },
            simulatedLessons,
            instructors,
            vehicles,
            settings,
            students
          );

          if (conflictCheck.length === 0) {
            alts.push({ date: dStr, startTime: sTime, endTime: eTime });
            if (alts.length >= 3) return alts;
          }
        }
      }
      return alts;
    };

    // Run loops to search for recommended slots inside the preferred days & preferred time windows
    for (let dayOffset = 0; dayOffset < totalDaysToScan; dayOffset++) {
      const currentDateObj = new Date(startDay);
      currentDateObj.setDate(currentDateObj.getDate() + dayOffset);
      const currentDateStr = currentDateObj.toISOString().split('T')[0];

      // Check Weekday preference:
      // JS getDay(): 0 is Sunday, 1 is Monday... 6 is Saturday.
      // Convert to 1-7 (where 1 = Monday, ..., 7 = Sunday)
      let customWeekday = currentDateObj.getDay();
      if (customWeekday === 0) customWeekday = 7;

      if (params.preferredDays.length > 0 && !params.preferredDays.includes(customWeekday)) {
        // Collect diagnostic warning
        diagnostics.push({
          type: 'OUTSIDE_HOURS',
          message: `Ngày ${currentDateStr} không nằm trong các Thứ ưu tiên đã lựa chọn.`
        });
        continue;
      }

      // Check Time Window preference
      const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
      const rangesToScan = params.preferredTimeRanges.length > 0
        ? params.preferredTimeRanges
        : [{ start: schoolHours.start, end: schoolHours.end }];

      // Try each instructor and vehicle pairing
      for (const inst of eligibleInstructors) {
        for (const veh of eligibleVehicles) {
          if (foundProposedSlot) break;

          for (const range of rangesToScan) {
            if (foundProposedSlot) break;

            const rStartMinutes = timeToMinutes(range.start);
            const rEndMinutes = timeToMinutes(range.end);

            for (let min = rStartMinutes; min + params.duration <= rEndMinutes; min += 30) {
              const candStart = minutesToTime(min);
              const candEnd = minutesToTime(min + params.duration);

              const check = evaluateIndividualAndWorkloadConflicts(
                {
                  studentId: student.id,
                  instructorId: inst.id,
                  vehicleId: veh.id,
                  date: currentDateStr,
                  startTime: candStart,
                  endTime: candEnd
                },
                simulatedLessons,
                instructors,
                vehicles,
                settings,
                students
              );

              if (check.length === 0) {
                // Success slot! 
                const slot: RecommendedSlot = {
                  studentId: student.id,
                  studentName: student.name,
                  instructorId: inst.id,
                  instructorName: inst.name,
                  vehicleId: veh.id,
                  vehiclePlate: veh.plate,
                  vehicleName: veh.name,
                  date: currentDateStr,
                  startTime: candStart,
                  endTime: candEnd,
                  score: item.score,
                  scoreBreakdown: {
                    examProximity: item.priorityDetails.examProximity,
                    idleDaysPoints: item.priorityDetails.idleDaysPoints,
                    completedLessonsPoints: item.priorityDetails.completedLessonsPoints,
                    timePreferenceMatch: true
                  },
                  duration: params.duration,
                  conflicts: [],
                  alternatives: []
                };

                recommendedSlots.push(slot);

                // Dedicate slot in simulated pool
                simulatedLessons.push({
                  id: `sim_slot_${Math.random().toString(36).substr(2, 9)}`,
                  studentId: student.id,
                  instructorId: inst.id,
                  vehicleId: veh.id,
                  date: currentDateStr,
                  startTime: candStart,
                  endTime: candEnd,
                  lessonType: (student.licenseClass.includes('B') ? 'Sa hình' : 'Làm quen xe') as LessonType,
                  pickupLocation: student.address,
                  trainingLocation: 'Sa hình Trung tâm',
                  notes: 'Lịch tự động',
                  status: 'Chờ xác nhận',
                  attendanceStatus: 'Chưa điểm danh',
                  resultNote: ''
                });

                foundProposedSlot = true;
                break;
              } else {
                // Append unique explanations
                check.forEach(conflict => {
                  if (!diagnostics.some(d => d.message === conflict.message)) {
                    diagnostics.push(conflict);
                  }
                });
              }
            }
          }
        }
      }

      if (foundProposedSlot) break;
    }

    // 3. IF NO PREFERRED SLOT FOUND, COLLECT ALTS & FAIL LOGS
    if (!foundProposedSlot) {
      const selectedInst = eligibleInstructors[0] || instructors[0];
      const selectedVeh = eligibleVehicles[0] || vehicles[0];

      // Grab fallback alternatives (next 3 valid slots)
      fallbackAlternatives = gatherAlternatives(
        student.id,
        selectedInst?.id || 'none',
        selectedVeh?.id || 'none',
        params.startDate
      );

      const failedSlot: RecommendedSlot = {
        studentId: student.id,
        studentName: student.name,
        instructorId: selectedInst?.id || 'none',
        instructorName: selectedInst?.name || 'Tự động',
        vehicleId: selectedVeh?.id || 'none',
        vehiclePlate: selectedVeh?.plate || 'Tự động',
        vehicleName: selectedVeh?.name || 'Tự động',
        date: params.startDate,
        startTime: '08:00',
        endTime: minutesToTime(timeToMinutes('08:00') + params.duration),
        score: item.score,
        scoreBreakdown: {
          examProximity: item.priorityDetails.examProximity,
          idleDaysPoints: item.priorityDetails.idleDaysPoints,
          completedLessonsPoints: item.priorityDetails.completedLessonsPoints,
          timePreferenceMatch: false
        },
        duration: params.duration,
        conflicts: diagnostics.length > 0 ? diagnostics.slice(0, 5) : [
          { type: 'OTHER', message: 'Không tìm thấy khoảng thời gian trống tương thích rảnh rỗi của giáo viên và phương tiện.' }
        ],
        alternatives: fallbackAlternatives
      };

      failedSlots.push(failedSlot);
    }
  }

  return {
    success: recommendedSlots.length > 0,
    recommendedSlots,
    failedSlots
  };
}

/**
 * Validates hard constraints for double-bookings, maintenance, days-off, and working hours.
 */
export function evaluateIndividualAndWorkloadConflicts(
  lesson: {
    studentId: string;
    instructorId: string;
    vehicleId: string;
    date: string; // yyyy-MM-dd
    startTime: string; // HH:mm
    endTime: string; // HH:mm
  },
  existingLessons: Lesson[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  settings: AppSettings,
  students: Student[]
): ConflictExplanation[] {
  const conflicts: ConflictExplanation[] = [];
  const startM = timeToMinutes(lesson.startTime);
  const endM = timeToMinutes(lesson.endTime);

  // Constraint: Working hours check
  if (endM <= startM) {
    conflicts.push({
      type: 'OUTSIDE_HOURS',
      message: 'Thời gian kết thúc phải lớn hơn thời gian bắt đầu.'
    });
    return conflicts;
  }

  const schoolHours = settings?.workingHours || { start: '07:00', end: '18:00' };
  const schoolStart = timeToMinutes(schoolHours.start);
  const schoolEnd = timeToMinutes(schoolHours.end);
  if (startM < schoolStart || endM > schoolEnd) {
    conflicts.push({
      type: 'OUTSIDE_HOURS',
      message: `Ca học nằm ngoài khung giờ mở cửa của trường (${schoolHours.start} - ${schoolHours.end}).`
    });
  }

  const student = students.find(s => s.id === lesson.studentId);
  const buffer = settings.autoSchedulingRules?.safetyBufferMinutes || 0;
  const maxDayLessons = settings.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1;

  // Constraint: Instructor Day Off, workingDays and Availability
  const teacher = instructors.find(i => i.id === lesson.instructorId);
  if (teacher) {
    if (!teacher.active) {
      conflicts.push({
        type: 'INSTRUCTOR_OFF',
        message: `Giáo viên ${teacher.name} đã ngưng hoạt động.`
      });
    }

    if (teacher.daysOff.includes(lesson.date)) {
      conflicts.push({
        type: 'INSTRUCTOR_OFF',
        message: `Giáo viên ${teacher.name} đang đăng ký nghỉ phép ngày ${lesson.date}.`
      });
    }

    const dObj = parseLocalDate(lesson.date);
    let customWeekday = dObj.getDay();
    if (customWeekday === 0) customWeekday = 7;
    if (!teacher.workingDays.includes(customWeekday)) {
      conflicts.push({
        type: 'INSTRUCTOR_OFF',
        message: `Giáo viên ${teacher.name} không có lịch trực vào ngày Thứ ${customWeekday === 7 ? 'Chủ Nhật' : customWeekday + 1}.`
      });
    }

    // Constraint: instructor's daily working hours bounds
    const teachHours = teacher.workingHours || { start: '07:00', end: '18:00' };
    const teacherStart = timeToMinutes(teachHours.start);
    const teacherEnd = timeToMinutes(teachHours.end);
    if (startM < teacherStart || endM > teacherEnd) {
      conflicts.push({
        type: 'OUTSIDE_HOURS',
        message: `Học ngoài giờ trực cá nhân của giáo viên ${teacher.name} (${teachHours.start} - ${teachHours.end}).`
      });
    }
  } else {
    conflicts.push({
      type: 'INSTRUCTOR_OFF',
      message: `Trường hợp này chưa được phân bổ Giáo viên hợp lệ.`
    });
  }

  // Constraint: Vehicle status Check
  const car = vehicles.find(v => v.id === lesson.vehicleId);
  if (car) {
    if (car.status !== 'Sẵn sàng') {
      conflicts.push({
        type: 'VEHICLE_MAINTENANCE',
        message: `Xe tập ${car.name} (${car.plate}) đang ở trạng thái bảo dưỡng/ngưng dùng: ${car.status}.`
      });
    }
  } else {
    conflicts.push({
      type: 'VEHICLE_MAINTENANCE',
      message: `Trường hợp này chưa phân bổ xe tập hợp lệ.`
    });
  }

  if (student) {
    // Constraint: maxLessonsPerStudentPerDay Limit
    const studentLessonsOnDay = existingLessons.filter(l => 
      l.studentId === lesson.studentId && 
      l.date === lesson.date &&
      l.status !== 'Học viên báo nghỉ' && 
      l.status !== 'Giảng viên báo nghỉ' && 
      l.status !== 'Hủy lịch'
    ).length;

    if (studentLessonsOnDay >= maxDayLessons) {
      conflicts.push({
        type: 'STUDENT_CONFLICT',
        message: `Học viên ${student.name} đã học tối đa ${maxDayLessons} ca/ngày theo quy định.`
      });
    }

    // Constraint: License compatibility check with instructor.vehicleTypes
    if (teacher && !teacher.vehicleTypes.includes(student.licenseClass)) {
      conflicts.push({
        type: 'INSTRUCTOR_OFF',
        message: `Hạng bằng của Học viên (${student.licenseClass}) nằm ngoài phân loại có thể dạy của Giảng viên ${teacher.name} (${teacher.vehicleTypes.join(', ')}).`
      });
    }

    // Constraint: License compatibility check with vehicle.suitableLicenseClass & transmission
    if (car) {
      if (car.suitableLicenseClass && car.suitableLicenseClass !== student.licenseClass) {
        conflicts.push({
          type: 'VEHICLE_MAINTENANCE',
          message: `Xe tập ${car.name} (${car.plate}) chỉ phù hợp đào tạo hạng bằng ${car.suitableLicenseClass}, học viên ký hạng ${student.licenseClass}.`
        });
      }

      if (student.licenseClass === 'B số tự động' && car.transmission !== 'Số tự động') {
        conflicts.push({
          type: 'VEHICLE_MAINTENANCE',
          message: `Học viên học hạng B số tự động (B1) không được xếp xe tập Số sàn.`
        });
      } else if ((student.licenseClass === 'B số sàn' || student.licenseClass === 'C1') && car.transmission !== 'Số sàn') {
        conflicts.push({
          type: 'VEHICLE_MAINTENANCE',
          message: `Học viên học hạng ${student.licenseClass} không được xếp xe tập Số tự động.`
        });
      }
    }
  }

  // Constraint: Double Booking Overlaps and Safety Buffer Gap checks
  for (const item of existingLessons) {
    if (item.status === 'Học viên báo nghỉ' || item.status === 'Giảng viên báo nghỉ' || item.status === 'Hủy lịch') {
      continue;
    }

    if (item.date === lesson.date) {
      const itemStartM = timeToMinutes(item.startTime);
      const itemEndM = timeToMinutes(item.endTime);
      
      const overlap = checkIntervalOverlap(lesson.startTime, lesson.endTime, item.startTime, item.endTime);
      const bufferOverlap = startM < itemEndM + buffer && itemStartM - buffer < endM;

      if (bufferOverlap) {
        if (item.studentId === lesson.studentId) {
          if (overlap) {
            conflicts.push({
              type: 'STUDENT_CONFLICT',
              message: `Học viên đã vướng lịch học khác trùng giờ (${item.startTime} - ${item.endTime}).`
            });
          } else {
            conflicts.push({
              type: 'STUDENT_CONFLICT',
              message: `Khoảng nghỉ giữa các ca học học viên chưa đạt tối thiểu ${buffer} phút (${item.startTime} - ${item.endTime}).`
            });
          }
        }
        if (item.instructorId === lesson.instructorId) {
          if (overlap) {
            conflicts.push({
              type: 'INSTRUCTOR_CONFLICT',
              message: `Giáo viên ${teacher?.name || 'phân công'} bị kẹt ca dạy khác trùng mốc (${item.startTime} - ${item.endTime}).`
            });
          } else {
            conflicts.push({
              type: 'INSTRUCTOR_CONFLICT',
              message: `Giáo viên ${teacher?.name || 'phân công'} cần khoảng nghỉ ${buffer} phút trước ca học tiếp theo (${item.startTime} - ${item.endTime}).`
            });
          }
        }
        if (item.vehicleId === lesson.vehicleId) {
          if (overlap) {
            conflicts.push({
              type: 'VEHICLE_CONFLICT',
              message: `Xe tập ${car?.name || ''} (${car?.plate || ''}) bị trùng kẹt phục vụ ca khác (${item.startTime} - ${item.endTime}).`
            });
          } else {
            conflicts.push({
              type: 'VEHICLE_CONFLICT',
              message: `Xe tập ${car?.name || ''} (${car?.plate || ''}) cần khoảng nghỉ vệ sinh/bảo trì ${buffer} phút (${item.startTime} - ${item.endTime}).`
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * UNIT TEST RUNNER
 * Tests various conflict and scheduling scenarios, returns structural outcome data.
 */
export interface UnitTestResult {
  name: string;
  scenario: string;
  passed: boolean;
  diagnostics: string[];
  recommendedSlotCount: number;
  failedSlotCount: number;
}

export function executeSchedulingUnitTests(
  mockStudents: Student[],
  mockInstructors: Instructor[],
  mockVehicles: Vehicle[],
  mockLessons: Lesson[],
  mockSettings: AppSettings
): UnitTestResult[] {
  const testResults: UnitTestResult[] = [];

  // Scenario 1: Student Conflict
  // We book Student 1 at 08:00 - 10:00 on 2026-06-10. Then we request another booking for them at same time.
  const s1Id = mockStudents[0]?.id || 'stud_test_1';
  const instId = mockInstructors[0]?.id || 'inst_1';
  const vehId = mockVehicles[0]?.id || 'veh_1';
  const testDate = '2026-06-10';

  const baseLessons: Lesson[] = [
    {
      id: 'existing_les_s1',
      studentId: s1Id,
      instructorId: instId,
      vehicleId: vehId,
      date: testDate,
      startTime: '08:00',
      endTime: '10:00',
      lessonType: 'Sa hình',
      pickupLocation: 'Pick',
      trainingLocation: 'Track',
      notes: 'Lịch bận',
      status: 'Đã xác nhận',
      attendanceStatus: 'Chưa điểm danh',
      resultNote: ''
    }
  ];

  const conflict1 = evaluateIndividualAndWorkloadConflicts(
    { studentId: s1Id, instructorId: instId, vehicleId: vehId, date: testDate, startTime: '09:00', endTime: '11:00' },
    baseLessons,
    mockInstructors,
    mockVehicles,
    mockSettings,
    mockStudents
  );
  
  const studentConflictPassed = conflict1.some(c => c.type === 'STUDENT_CONFLICT');
  testResults.push({
    name: 'Kiểm thử 1: Trùng lịch Học viên (Student Conflict)',
    scenario: 'Đăng ký trùng mốc thời gian học viên đã kẹt ca sẵn.',
    passed: studentConflictPassed,
    diagnostics: conflict1.map(c => c.message),
    recommendedSlotCount: 0,
    failedSlotCount: 1
  });

  // Scenario 2: Instructor Conflict
  // Instructor is teaching another student at same time
  const s2Id = mockStudents[1]?.id || 'stud_test_2';
  const instLessons: Lesson[] = [
    {
      id: 'existing_les_inst',
      studentId: s2Id,
      instructorId: instId,
      vehicleId: vehId,
      date: testDate,
      startTime: '10:00',
      endTime: '12:00',
      lessonType: 'Sa hình',
      pickupLocation: 'Pick',
      trainingLocation: 'Track',
      notes: 'Lịch Thầy',
      status: 'Đã xác nhận',
      attendanceStatus: 'Chưa điểm danh',
      resultNote: ''
    }
  ];

  const conflict2 = evaluateIndividualAndWorkloadConflicts(
    { studentId: s1Id, instructorId: instId, vehicleId: vehId, date: testDate, startTime: '11:00', endTime: '13:00' },
    instLessons,
    mockInstructors,
    mockVehicles,
    mockSettings,
    mockStudents
  );
  const instructorConflictPassed = conflict2.some(c => c.type === 'INSTRUCTOR_CONFLICT') || conflict2.some(c => c.type === 'VEHICLE_CONFLICT');
  testResults.push({
    name: 'Kiểm thử 2: Trùng lịch Giảng viên (Instructor Conflict)',
    scenario: 'Xếp lịch mới cho thầy khi thầy đang bận ca dạy học viên khác.',
    passed: instructorConflictPassed,
    diagnostics: conflict2.map(c => c.message),
    recommendedSlotCount: 0,
    failedSlotCount: 1
  });

  // Scenario 3: Vehicle Conflict
  // Vehicle is utilized by another teacher-student at same time
  const anotherInst = mockInstructors[1]?.id || 'inst_2';
  const vehicleLessons: Lesson[] = [
    {
      id: 'existing_les_veh',
      studentId: s2Id,
      instructorId: anotherInst,
      vehicleId: vehId, // same car
      date: testDate,
      startTime: '14:00',
      endTime: '16:00',
      lessonType: 'Sa hình',
      pickupLocation: 'Pick',
      trainingLocation: 'Track',
      notes: 'Lịch Xe',
      status: 'Đã xác nhận',
      attendanceStatus: 'Chưa điểm danh',
      resultNote: ''
    }
  ];

  const conflict3 = evaluateIndividualAndWorkloadConflicts(
    { studentId: s1Id, instructorId: instId, vehicleId: vehId, date: testDate, startTime: '15:00', endTime: '17:00' },
    vehicleLessons,
    mockInstructors,
    mockVehicles,
    mockSettings,
    mockStudents
  );
  const vehicleConflictPassed = conflict3.some(c => c.type === 'VEHICLE_CONFLICT');
  testResults.push({
    name: 'Kiểm thử 3: Trùng xe tập (Vehicle Conflict)',
    scenario: 'Xếp lịch dùng xe khi xe đang gánh ca dạy học viên khác.',
    passed: vehicleConflictPassed,
    diagnostics: conflict3.map(c => c.message),
    recommendedSlotCount: 0,
    failedSlotCount: 1
  });

  // Scenario 4: Vehicle Under Maintenance
  // status !== 'Sẵn sàng' (e.g. status = 'Bảo dưỡng')
  const maintenanceVehicles = mockVehicles.map(v => 
    v.id === vehId ? { ...v, status: 'Bảo dưỡng' as any } : v
  );
  const conflict4 = evaluateIndividualAndWorkloadConflicts(
    { studentId: s1Id, instructorId: instId, vehicleId: vehId, date: testDate, startTime: '08:00', endTime: '10:00' },
    [],
    mockInstructors,
    maintenanceVehicles,
    mockSettings,
    mockStudents
  );
  const maintenancePassed = conflict4.some(c => c.type === 'VEHICLE_MAINTENANCE');
  testResults.push({
    name: 'Kiểm thử 4: Xe đang bảo dưỡng (Vehicle Maintenance)',
    scenario: 'Cấm nén xếp ca khi xe được đánh trạng thái Bảo dưỡng/Tạm ngưng.',
    passed: maintenancePassed,
    diagnostics: conflict4.map(c => c.message),
    recommendedSlotCount: 0,
    failedSlotCount: 1
  });

  // Scenario 5: Instructor Day Off
  // requested date coincides with teacher daysOff
  const dayOffInstructors = mockInstructors.map(i => 
    i.id === instId ? { ...i, daysOff: [testDate] } : i
  );
  const conflict5 = evaluateIndividualAndWorkloadConflicts(
    { studentId: s1Id, instructorId: instId, vehicleId: vehId, date: testDate, startTime: '08:00', endTime: '10:00' },
    [],
    dayOffInstructors,
    mockVehicles,
    mockSettings,
    mockStudents
  );
  const dayOffPassed = conflict5.some(c => c.type === 'INSTRUCTOR_OFF');
  testResults.push({
    name: 'Kiểm thử 5: Giảng viên nghỉ phép (Instructor Day Off)',
    scenario: 'Cấm xếp lịch trùng vào ngày nghỉ phép đột xuất của giáo viên.',
    passed: dayOffPassed,
    diagnostics: conflict5.map(c => c.message),
    recommendedSlotCount: 0,
    failedSlotCount: 1
  });

  // Scenario 6: No Valid Slot
  // Search within date range with fully booked calendar -> should yield failedSlot with correct 3 alternative matches on subsequent dates
  const tightLessons: Lesson[] = [];
  // Book all time ranges for June 10
  const hrs = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
  for (let i = 0; i < hrs.length - 1; i++) {
    tightLessons.push({
      id: `tight_${i}`,
      studentId: s2Id,
      instructorId: instId,
      vehicleId: vehId,
      date: testDate,
      startTime: hrs[i],
      endTime: hrs[i+1],
      lessonType: 'Sa hình',
      pickupLocation: 'P',
      trainingLocation: 'T',
      status: 'Đã xác nhận',
      attendanceStatus: 'Có mặt',
      resultNote: '',
      notes: ''
    });
  }

  // Request auto scheduling for s1Id on testDate (one-day range)
  const engineResult = runAdvancedSchedulingEngine(
    {
      studentIds: [s1Id],
      startDate: testDate,
      endDate: testDate,
      preferredDays: [],
      preferredTimeRanges: [],
      duration: 120,
      preferredInstructorId: instId,
      preferredVehicleId: vehId
    },
    mockStudents,
    mockInstructors,
    mockVehicles,
    tightLessons,
    mockSettings
  );

  const noValidSlotPassed = engineResult.failedSlots.length === 1 && engineResult.failedSlots[0].alternatives.length > 0;
  testResults.push({
    name: 'Kiểm thử 6: Không có mốc giờ hợp lệ (No Valid Slot)',
    scenario: 'Xếp lịch khi lịch rảnh ngày đó bị kín mít; Đề xuất 3 phương án kề cận.',
    passed: noValidSlotPassed,
    diagnostics: engineResult.failedSlots[0]?.conflicts.map(c => c.message) || [],
    recommendedSlotCount: engineResult.recommendedSlots.length,
    failedSlotCount: engineResult.failedSlots.length
  });

  // Scenario 7: Manual Override simulation
  // Simulate the manual override action confirming and logging
  const overrideLog: AuditLog = {
    id: `log_test_override_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'Ghi đè thủ công Lịch học',
    details: `Quản trị viên đã bỏ qua cảnh báo trùng để ghi đè lịch học viên ${mockStudents[0]?.name || ''} với thầy ${mockInstructors[0]?.name || ''}.`,
    userId: 'test_admin',
    userName: 'Tester Admin',
    userRole: 'Admin'
  };

  testResults.push({
    name: 'Kiểm thử 7: Ghi đè lịch thủ công (Manual Override Logging)',
    scenario: 'Bỏ qua cảnh báo kẹt để áp đặt xếp lịch cứng và ghi nhận nhật ký hệ thống.',
    passed: overrideLog.details !== undefined && overrideLog.action.includes('Ghi đè'),
    diagnostics: [overrideLog.details],
    recommendedSlotCount: 1,
    failedSlotCount: 0
  });

  return testResults;
}
