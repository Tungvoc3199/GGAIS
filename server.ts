import express from "express";
import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

declare global {
  namespace Express {
    interface Request {
      currentUserProfile?: any;
    }
  }
}

const configPath = path.join(process.cwd(), "src", "firebase-applet-config.json");
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (error) {
  console.error("Lỗi đọc cấu hình Firebase:", error);
}

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

let aiInstance: GoogleGenAI | null = null;
const ocrRateLimit = new Map<string, { count: number; windowStartedAt: number }>();
const INACTIVE_LESSON_STATUSES = new Set(["Học viên báo nghỉ", "Giảng viên báo nghỉ", "Hủy lịch"]);
const LESSON_STATUSES = new Set(["Chờ xác nhận", "Đã xác nhận", "Đã hoàn thành", "Học viên báo nghỉ", "Giảng viên báo nghỉ", "Hủy lịch"]);
const ATTENDANCE_STATUSES = new Set(["Chưa điểm danh", "Có mặt", "Vắng"]);

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY chưa được cấu hình.");
    aiInstance = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  }
  return aiInstance;
}

function getAdminDb() {
  const dbId = firebaseConfig.firestoreDatabaseId;
  return dbId && dbId !== "(default)" ? admin.firestore(dbId) : admin.firestore();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function isValidId(value: unknown): boolean {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function getVietnamDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : Number.NaN;
}

function getLocalWeekday(dateString: string): number {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) return -1;
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 ? 7 : weekday;
}

function intervalsOverlap(start1: string, end1: string, start2: string, end2: string, buffer = 0): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);
  return s1 < e2 + buffer && s2 - buffer < e1;
}

function isLocalDemoRequest(req: express.Request): boolean {
  return process.env.NODE_ENV !== "production" && req.headers["x-demo-mode"] === "true";
}

function normalizeLesson(input: any, id?: string) {
  return {
    id: id || (isValidId(input?.id) ? input.id : makeId("less")),
    studentId: String(input?.studentId || ""),
    instructorId: String(input?.instructorId || ""),
    vehicleId: String(input?.vehicleId || ""),
    date: String(input?.date || ""),
    startTime: String(input?.startTime || ""),
    endTime: String(input?.endTime || ""),
    lessonType: String(input?.lessonType || "Sa hình"),
    pickupLocation: String(input?.pickupLocation || ""),
    trainingLocation: String(input?.trainingLocation || ""),
    notes: String(input?.notes || ""),
    status: LESSON_STATUSES.has(input?.status) ? input.status : "Chờ xác nhận",
    attendanceStatus: ATTENDANCE_STATUSES.has(input?.attendanceStatus) ? input.attendanceStatus : "Chưa điểm danh",
    resultNote: String(input?.resultNote || "")
  };
}

async function loadLessonState(transaction: any, db: any) {
  const [lessonsSnap, instructorsSnap, vehiclesSnap, studentsSnap, settingsDoc] = await Promise.all([
    transaction.get(db.collection("lessons")),
    transaction.get(db.collection("instructors")),
    transaction.get(db.collection("vehicles")),
    transaction.get(db.collection("students")),
    transaction.get(db.collection("settings").doc("schoolSettings"))
  ]);

  const lessons: any[] = [];
  const instructors: any[] = [];
  const vehicles: any[] = [];
  const studentsMap: Record<string, any> = {};

  lessonsSnap.forEach((item: any) => lessons.push(item.data()));
  instructorsSnap.forEach((item: any) => instructors.push(item.data()));
  vehiclesSnap.forEach((item: any) => vehicles.push(item.data()));
  studentsSnap.forEach((item: any) => { studentsMap[item.id] = item.data(); });

  return {
    lessons,
    instructors,
    vehicles,
    studentsMap,
    settings: settingsDoc.exists ? settingsDoc.data() : {}
  };
}

function validateLesson(lesson: any, state: any, ignoreLessonId?: string): string[] {
  const reasons: string[] = [];
  const start = timeToMinutes(lesson.startTime);
  const end = timeToMinutes(lesson.endTime);
  const student = state.studentsMap[lesson.studentId];
  const instructor = state.instructors.find((item: any) => item.id === lesson.instructorId);
  const vehicle = state.vehicles.find((item: any) => item.id === lesson.vehicleId);
  const buffer = Number(state.settings?.autoSchedulingRules?.safetyBufferMinutes || 0);
  const schoolStart = timeToMinutes(state.settings?.workingHours?.start || "00:00");
  const schoolEnd = timeToMinutes(state.settings?.workingHours?.end || "23:59");
  const maxLessonsPerDay = Number(state.settings?.autoSchedulingRules?.maxLessonsPerStudentPerDay || 1);

  if (!lesson.studentId || !lesson.instructorId || !lesson.vehicleId || !lesson.date) reasons.push("Thiếu học viên, giảng viên, xe hoặc ngày học.");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reasons.push("Giờ kết thúc phải lớn hơn giờ bắt đầu.");
  if (!student) reasons.push("Không tìm thấy học viên hợp lệ.");
  if (!instructor) reasons.push("Không tìm thấy giảng viên hợp lệ.");
  if (!vehicle) reasons.push("Không tìm thấy xe hợp lệ.");
  if (Number.isFinite(start) && Number.isFinite(end) && (start < schoolStart || end > schoolEnd)) reasons.push("Ca học nằm ngoài giờ mở cửa của trường.");

  if (instructor) {
    if (!instructor.active) reasons.push(`Giảng viên ${instructor.name} đang ngưng hoạt động.`);
    if (start < timeToMinutes(instructor.workingHours?.start) || end > timeToMinutes(instructor.workingHours?.end)) reasons.push(`Ngoài giờ làm việc của GV ${instructor.name}.`);
    if (Array.isArray(instructor.daysOff) && instructor.daysOff.includes(lesson.date)) reasons.push(`GV ${instructor.name} nghỉ phép ngày ${lesson.date}.`);
    if (Array.isArray(instructor.workingDays) && !instructor.workingDays.includes(getLocalWeekday(lesson.date))) reasons.push(`GV ${instructor.name} không làm việc trong ngày đã chọn.`);
    if (student && Array.isArray(instructor.vehicleTypes) && !instructor.vehicleTypes.includes(student.licenseClass)) reasons.push(`GV ${instructor.name} không phụ trách hạng ${student.licenseClass}.`);
  }

  if (vehicle) {
    if (vehicle.status !== "Sẵn sàng") reasons.push(`Xe ${vehicle.name} (${vehicle.plate}) hiện ở trạng thái ${vehicle.status}.`);
    if (student?.licenseClass === "B số tự động" && vehicle.transmission !== "Số tự động") reasons.push("Học viên B số tự động không được xếp xe số sàn.");
    if ((student?.licenseClass === "B số sàn" || student?.licenseClass === "C1") && vehicle.transmission !== "Số sàn") reasons.push(`Học viên ${student.licenseClass} không được xếp xe số tự động.`);
    if (student && vehicle.suitableLicenseClass && vehicle.suitableLicenseClass !== student.licenseClass) reasons.push(`Xe chỉ phù hợp hạng ${vehicle.suitableLicenseClass}.`);
  }

  const activeLessons = state.lessons.filter((item: any) => item.id !== ignoreLessonId && !INACTIVE_LESSON_STATUSES.has(item.status));
  const sameStudentDayCount = activeLessons.filter((item: any) => item.studentId === lesson.studentId && item.date === lesson.date).length;
  if (student && sameStudentDayCount >= maxLessonsPerDay) reasons.push(`Học viên ${student.name} đã đủ ${maxLessonsPerDay} ca trong ngày.`);

  activeLessons.forEach((existing: any) => {
    if (existing.date !== lesson.date || !intervalsOverlap(lesson.startTime, lesson.endTime, existing.startTime, existing.endTime, buffer)) return;
    if (existing.studentId === lesson.studentId) reasons.push(`Học viên bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${existing.startTime}-${existing.endTime}.`);
    if (existing.instructorId === lesson.instructorId) reasons.push(`Giảng viên bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${existing.startTime}-${existing.endTime}.`);
    if (existing.vehicleId === lesson.vehicleId) reasons.push(`Xe bị trùng lịch hoặc thiếu khoảng nghỉ với ca ${existing.startTime}-${existing.endTime}.`);
  });

  return [...new Set(reasons)];
}

function writeAuditLog(transaction: any, db: any, user: any, action: string, details: string) {
  const id = makeId("log");
  transaction.set(db.collection("auditLogs").doc(id), {
    id,
    timestamp: new Date().toISOString(),
    action,
    details,
    userId: user.uid,
    userName: user.displayName || user.email || "Người dùng",
    userRole: user.role
  });
}

function getSessionUpdate(student: any, delta: number) {
  const totalSessions = Number(student.totalSessions || 0);
  const completedSessions = Math.max(0, Math.min(totalSessions, Number(student.completedSessions || 0) + delta));
  return { completedSessions, remainingSessions: Math.max(0, totalSessions - completedSessions) };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: "6mb" }));
  app.use(express.urlencoded({ extended: true, limit: "6mb" }));

  async function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Không tìm thấy mã xác thực Authorization." });

    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) return res.status(403).json({ error: "Tài khoản chưa được cấp quyền sử dụng hệ thống." });
      req.currentUserProfile = { ...userDoc.data(), uid: decoded.uid, email: decoded.email || userDoc.data()?.email };
      next();
    } catch (error) {
      console.error("Xác thực ID Token thất bại:", error);
      return res.status(401).json({ error: "Xác thực không hợp lệ hoặc đã hết hạn." });
    }
  }

  async function checkAuthOrLocalDemo(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (isLocalDemoRequest(req)) {
      req.currentUserProfile = { uid: "offline-demo", email: "offline-demo@lichhocpro.local", displayName: "Offline Demo", role: "Staff" };
      next();
      return;
    }
    await checkAuth(req, res, next);
  }

  function requireRoles(...roles: string[]) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!roles.includes(req.currentUserProfile?.role)) return res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này." });
      next();
    };
  }

  app.post("/api/admin/create-user", checkAuth, requireRoles("Admin"), async (req, res) => {
    const { email, password, displayName, role } = req.body;
    if (!email || !password || !displayName || !["Admin", "Staff", "Instructor", "Accountant"].includes(role)) return res.status(400).json({ error: "Thông tin tài khoản hoặc vai trò không hợp lệ." });

    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName });
      const profile = { uid: userRecord.uid, email, displayName, role };
      const db = getAdminDb();
      await db.collection("users").doc(userRecord.uid).set(profile);
      const logId = makeId("log");
      await db.collection("auditLogs").doc(logId).set({ id: logId, timestamp: new Date().toISOString(), action: "Tạo tài khoản thành viên", details: `Tạo tài khoản ${displayName} (${email}) với vai trò ${role}.`, userId: req.currentUserProfile.uid, userName: req.currentUserProfile.displayName, userRole: "Admin" });
      return res.json({ success: true, user: profile });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Không thể tạo tài khoản." });
    }
  });

  app.post("/api/payments/create", checkAuth, requireRoles("Admin", "Staff", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { studentId, paymentDate, amount, method, category, receiver, notes } = req.body;
    const numericAmount = Number(amount);
    if (!studentId || !Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Mã học viên hoặc số tiền không hợp lệ." });

    const db = getAdminDb();
    const requestedId = String(req.body.id || "");
    const payment = { id: isValidId(requestedId) && requestedId.startsWith("pay_") ? requestedId : makeId("pay"), studentId, paymentDate: paymentDate || getVietnamDateString(), amount: numericAmount, method: method || "Chuyển khoản", category: category || "Đợt 1", receiver: receiver || user.displayName, notes: notes || "", isCancelled: false, createdAt: new Date().toISOString(), createdBy: user.email, status: user.role === "Admin" || user.role === "Accountant" || !["Thanh toán bổ sung", "Khác"].includes(category) ? "Đã duyệt" : "Chờ duyệt" };

    try {
      await db.runTransaction(async (transaction: any) => {
        const studentRef = db.collection("students").doc(studentId);
        const paymentRef = db.collection("payments").doc(payment.id);
        const [studentDoc, existingPayment] = await Promise.all([transaction.get(studentRef), transaction.get(paymentRef)]);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");
        if (existingPayment.exists) throw new Error("Phiếu thu đã tồn tại.");
        const student = studentDoc.data();
        transaction.set(paymentRef, payment);
        if (payment.status === "Đã duyệt") {
          const paidAmount = Number(student.paidAmount || 0) + numericAmount;
          transaction.update(studentRef, { paidAmount, remainingAmount: Math.max(0, Number(student.totalFee || 0) - paidAmount), reminderStatus: "Chưa nhắc" });
        }
        writeAuditLog(transaction, db, user, "Thu học phí", `Ghi nhận ${numericAmount.toLocaleString("vi-VN")} đ từ ${student.name} (${payment.status}) [Server Transaction].`);
      });
      return res.json({ success: true, payment });
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể ghi nhận học phí." });
    }
  });

  app.post("/api/payments/approve", checkAuth, requireRoles("Admin", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "Thiếu paymentId." });
    const db = getAdminDb();

    try {
      await db.runTransaction(async (transaction: any) => {
        const paymentRef = db.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) throw new Error("Không tìm thấy phiếu thu.");
        const payment = paymentDoc.data();
        if (payment.status === "Đã duyệt") throw new Error("Phiếu đã được duyệt trước đó.");
        if (payment.isCancelled) throw new Error("Phiếu đã bị hủy.");
        const studentRef = db.collection("students").doc(payment.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");
        const student = studentDoc.data();
        const paidAmount = Number(student.paidAmount || 0) + Number(payment.amount || 0);
        transaction.update(paymentRef, { status: "Đã duyệt" });
        transaction.update(studentRef, { paidAmount, remainingAmount: Math.max(0, Number(student.totalFee || 0) - paidAmount) });
        writeAuditLog(transaction, db, user, "Duyệt học phí", `Duyệt phiếu ${paymentId} cho ${student.name} [Server Transaction].`);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể duyệt phiếu." });
    }
  });

  app.post("/api/payments/cancel", checkAuth, requireRoles("Admin", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { paymentId, reason } = req.body;
    if (!paymentId || !String(reason || "").trim()) return res.status(400).json({ error: "Thiếu paymentId hoặc lý do hủy." });
    const db = getAdminDb();

    try {
      await db.runTransaction(async (transaction: any) => {
        const paymentRef = db.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) throw new Error("Không tìm thấy phiếu thu.");
        const payment = paymentDoc.data();
        if (payment.isCancelled) throw new Error("Phiếu đã được hủy trước đó.");
        const studentRef = db.collection("students").doc(payment.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");
        const student = studentDoc.data();
        transaction.update(paymentRef, { isCancelled: true, cancellationReason: String(reason).trim() });
        if (payment.status === "Đã duyệt") {
          const paidAmount = Math.max(0, Number(student.paidAmount || 0) - Number(payment.amount || 0));
          transaction.update(studentRef, { paidAmount, remainingAmount: Math.max(0, Number(student.totalFee || 0) - paidAmount) });
        }
        writeAuditLog(transaction, db, user, "Hủy phiếu thu", `Hủy phiếu ${paymentId}. Lý do: ${String(reason).trim()} [Server Transaction].`);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể hủy phiếu." });
    }
  });

  app.post("/api/lessons/save", checkAuth, requireRoles("Admin", "Staff", "Instructor"), async (req, res) => {
    const user = req.currentUserProfile;
    const overrideReason = String(req.body.overrideReason || "").trim();
    const lesson = normalizeLesson(req.body.lesson || req.body);
    const db = getAdminDb();

    try {
      const result = await db.runTransaction(async (transaction: any) => {
        const state = await loadLessonState(transaction, db);
        const previous = state.lessons.find((item: any) => item.id === lesson.id);
        if (!previous && user.role === "Instructor") throw new Error("Giảng viên không được tự tạo ca học mới.");
        if (previous && user.role === "Instructor") {
          const immutable = ["studentId", "instructorId", "vehicleId", "date", "startTime", "endTime", "lessonType", "pickupLocation", "trainingLocation"];
          if (immutable.some(key => previous[key] !== lesson[key])) throw new Error("Giảng viên chỉ được điểm danh, hoàn thành hoặc ghi nhận xét.");
        }

        const schedulingChanged = !previous || ["studentId", "instructorId", "vehicleId", "date", "startTime", "endTime"].some(key => previous[key] !== lesson[key]);
        const reasons = schedulingChanged ? validateLesson(lesson, state, lesson.id) : [];
        if (reasons.length && (user.role !== "Admin" || !overrideReason)) return { success: false, hasConflicts: true, conflicts: [{ lesson, reasons }], message: user.role === "Admin" ? "Nhập lý do ghi đè để lưu ca xung đột." : "Ca học xung đột. Chỉ Admin được ghi đè." };

        const student = state.studentsMap[lesson.studentId];
        const delta = previous?.status !== "Đã hoàn thành" && lesson.status === "Đã hoàn thành" ? 1 : previous?.status === "Đã hoàn thành" && lesson.status !== "Đã hoàn thành" ? -1 : 0;
        transaction.set(db.collection("lessons").doc(lesson.id), lesson);
        if (student && delta) transaction.update(db.collection("students").doc(lesson.studentId), getSessionUpdate(student, delta));
        writeAuditLog(transaction, db, user, previous ? "Cập nhật ca học" : "Tạo ca học", `${lesson.date} ${lesson.startTime}-${lesson.endTime}.${overrideReason ? ` Lý do ghi đè: ${overrideReason}` : ""}`);
        return { success: true, lesson, hasConflicts: Boolean(reasons.length) };
      });
      return res.json(result);
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể lưu ca học." });
    }
  });

  app.post("/api/lessons/delete", checkAuth, requireRoles("Admin", "Staff"), async (req, res) => {
    const user = req.currentUserProfile;
    const { lessonId } = req.body;
    if (!lessonId) return res.status(400).json({ error: "Thiếu lessonId." });
    const db = getAdminDb();

    try {
      await db.runTransaction(async (transaction: any) => {
        const lessonRef = db.collection("lessons").doc(lessonId);
        const lessonDoc = await transaction.get(lessonRef);
        if (!lessonDoc.exists) throw new Error("Không tìm thấy ca học.");
        const lesson = lessonDoc.data();
        const studentRef = db.collection("students").doc(lesson.studentId);
        const studentDoc = lesson.status === "Đã hoàn thành" ? await transaction.get(studentRef) : null;
        transaction.delete(lessonRef);
        if (studentDoc?.exists) transaction.update(studentRef, getSessionUpdate(studentDoc.data(), -1));
        writeAuditLog(transaction, db, user, "Xóa ca học", `Xóa ca ${lessonId}.`);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể xóa ca học." });
    }
  });

  app.post("/api/lessons/batch-confirm", checkAuth, requireRoles("Admin", "Staff"), async (req, res) => {
    const user = req.currentUserProfile;
    const requestedLessons = Array.isArray(req.body.lessons) ? req.body.lessons : [];
    const overrideReason = String(req.body.overrideReason || "").trim();
    if (!requestedLessons.length) return res.status(400).json({ error: "Danh sách ca học trống." });
    const db = getAdminDb();

    try {
      const result = await db.runTransaction(async (transaction: any) => {
        const state = await loadLessonState(transaction, db);
        const accepted: any[] = [];
        const conflicts: any[] = [];
        requestedLessons.forEach((raw: any, index: number) => {
          const lesson = normalizeLesson(raw, isValidId(raw?.id) && !String(raw.id).startsWith("sug_") ? raw.id : undefined);
          const reasons = validateLesson(lesson, { ...state, lessons: [...state.lessons, ...accepted] }, lesson.id);
          if (reasons.length) conflicts.push({ index, lesson, reasons }); else accepted.push(lesson);
        });

        if (conflicts.length && (user.role !== "Admin" || !overrideReason)) return { success: false, hasConflicts: true, conflicts, message: user.role === "Admin" ? "Nhập lý do ghi đè để lưu lịch xung đột." : "Phát hiện xung đột. Chỉ Admin được ghi đè." };
        const finalLessons = conflicts.length ? requestedLessons.map((raw: any) => normalizeLesson(raw, isValidId(raw?.id) && !String(raw.id).startsWith("sug_") ? raw.id : undefined)) : accepted;
        finalLessons.forEach((lesson: any) => transaction.set(db.collection("lessons").doc(lesson.id), { ...lesson, status: "Đã xác nhận", attendanceStatus: "Chưa điểm danh" }));
        writeAuditLog(transaction, db, user, conflicts.length ? "Ghi đè lịch học hàng loạt" : "Xếp lịch học hàng loạt", `Lưu ${finalLessons.length} ca học.${overrideReason ? ` Lý do ghi đè: ${overrideReason}` : ""}`);
        return { success: true, committedCount: finalLessons.length, hasConflicts: Boolean(conflicts.length) };
      });
      return res.json(result);
    } catch (error: any) {
      return res.status(409).json({ error: error.message || "Không thể lưu lịch hàng loạt." });
    }
  });

  app.post("/api/ocr-card", checkAuthOrLocalDemo, requireRoles("Admin", "Staff"), async (req, res) => {
    const user = req.currentUserProfile;
    const rateKey = user.uid || req.ip || "unknown";
    const now = Date.now();
    const currentRate = ocrRateLimit.get(rateKey);
    if (!currentRate || now - currentRate.windowStartedAt > 60_000) ocrRateLimit.set(rateKey, { count: 1, windowStartedAt: now });
    else {
      currentRate.count += 1;
      if (currentRate.count > 5) return res.status(429).json({ error: "Bạn thao tác OCR quá nhanh. Vui lòng thử lại sau một phút." });
    }

    try {
      const match = String(req.body.image || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return res.status(400).json({ error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP hợp lệ." });
      const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
      const base64Data = match[2];
      if (Buffer.byteLength(base64Data, "base64") > 4 * 1024 * 1024) return res.status(413).json({ error: "Ảnh vượt quá giới hạn 4 MB." });
      const prompt = `Đọc ảnh ${String(req.body.cardType || "CCCD").slice(0, 80)} của học viên Việt Nam. Trích xuất chính xác họ tên viết hoa, ngày sinh YYYY-MM-DD và địa chỉ thường trú. Nếu không nhìn thấy dữ liệu thì để chuỗi rỗng. Không được suy đoán.`;
      const response = await getGeminiClient().models.generateContent({ model: "gemini-3.5-flash", contents: [{ inlineData: { mimeType, data: base64Data } }, prompt], config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { fullName: { type: Type.STRING }, address: { type: Type.STRING }, dob: { type: Type.STRING } }, required: ["fullName", "address", "dob"] } } });
      return res.json({ success: true, data: JSON.parse((response.text || "{}").trim()) });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "Không thể xử lý ảnh." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Express server running on port ${PORT}`));
}

startServer();
