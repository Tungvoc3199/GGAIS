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
      adminUser?: any;
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

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY chưa được cấu hình.");
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
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

function getVietnamDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : Number.NaN;
}

function doIntervalsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(start2) < timeToMinutes(end1);
}

function getLocalWeekday(dateString: string): number {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) return -1;
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 ? 7 : weekday;
}

function isLocalDemoRequest(req: express.Request): boolean {
  return process.env.NODE_ENV !== "production" && req.headers["x-demo-mode"] === "true";
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "6mb" }));
  app.use(express.urlencoded({ extended: true, limit: "6mb" }));

  async function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Không tìm thấy mã xác thực Authorization." });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.substring(7));
      const adminDb = getAdminDb();
      const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();

      if (!userDoc.exists) {
        return res.status(403).json({ error: "Tài khoản chưa được cấp quyền sử dụng hệ thống." });
      }

      req.currentUserProfile = {
        ...userDoc.data(),
        uid: decodedToken.uid,
        email: decodedToken.email || userDoc.data()?.email
      };
      next();
    } catch (error) {
      console.error("Xác thực ID Token thất bại:", error);
      return res.status(401).json({ error: "Xác thực không hợp lệ hoặc đã hết hạn." });
    }
  }

  async function checkAuthOrLocalDemo(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (isLocalDemoRequest(req)) {
      req.currentUserProfile = {
        uid: "offline-demo",
        email: "offline-demo@lichhocpro.local",
        displayName: "Offline Demo",
        role: "Staff"
      };
      next();
      return;
    }
    await checkAuth(req, res, next);
  }

  function requireRoles(...roles: string[]) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!roles.includes(req.currentUserProfile?.role)) {
        return res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này." });
      }
      next();
    };
  }

  app.post("/api/admin/create-user", checkAuth, requireRoles("Admin"), async (req, res) => {
    const { email, password, displayName, role } = req.body;
    if (!email || !password || !displayName || !["Admin", "Staff", "Instructor", "Accountant"].includes(role)) {
      return res.status(400).json({ error: "Thông tin tài khoản hoặc vai trò không hợp lệ." });
    }

    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName });
      const profile = { uid: userRecord.uid, email, displayName, role };
      const adminDb = getAdminDb();
      await adminDb.collection("users").doc(userRecord.uid).set(profile);

      const logId = makeId("log");
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Tạo tài khoản thành viên",
        details: `Admin đã tạo tài khoản ${displayName} (${email}) với vai trò ${role}.`,
        userId: req.currentUserProfile.uid,
        userName: req.currentUserProfile.displayName || req.currentUserProfile.email,
        userRole: "Admin"
      });

      return res.json({ success: true, user: profile });
    } catch (error: any) {
      console.error("Lỗi tạo tài khoản:", error);
      return res.status(500).json({ error: error.message || "Không thể tạo tài khoản." });
    }
  });

  app.post("/api/payments/create", checkAuth, requireRoles("Admin", "Staff", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { studentId, paymentDate, amount, method, category, receiver, notes } = req.body;
    const numericAmount = Number(amount);

    if (!studentId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Mã học viên hoặc số tiền không hợp lệ." });
    }

    const adminDb = getAdminDb();
    const payment = {
      id: makeId("pay"),
      studentId,
      paymentDate: paymentDate || getVietnamDateString(),
      amount: numericAmount,
      method: method || "Chuyển khoản",
      category: category || "Đợt 1",
      receiver: receiver || user.displayName,
      notes: notes || "",
      isCancelled: false,
      createdAt: new Date().toISOString(),
      createdBy: user.email,
      status: user.role === "Admin" || user.role === "Accountant" || !["Thanh toán bổ sung", "Khác"].includes(category)
        ? "Đã duyệt"
        : "Chờ duyệt"
    };

    try {
      await adminDb.runTransaction(async (transaction) => {
        const studentRef = adminDb.collection("students").doc(studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");

        const studentData = studentDoc.data()!;
        transaction.set(adminDb.collection("payments").doc(payment.id), payment);

        if (payment.status === "Đã duyệt") {
          const paidAmount = Number(studentData.paidAmount || 0) + numericAmount;
          transaction.update(studentRef, {
            paidAmount,
            remainingAmount: Math.max(0, Number(studentData.totalFee || 0) - paidAmount),
            reminderStatus: "Chưa nhắc"
          });
        }

        const logId = makeId("log");
        transaction.set(adminDb.collection("auditLogs").doc(logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Thu học phí",
          details: `Ghi nhận ${numericAmount.toLocaleString("vi-VN")} đ từ ${studentData.name} (${payment.status}) [Server Transaction].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true, payment });
    } catch (error: any) {
      console.error("Giao dịch thu học phí thất bại:", error);
      return res.status(409).json({ error: error.message || "Không thể ghi nhận học phí." });
    }
  });

  app.post("/api/payments/approve", checkAuth, requireRoles("Admin", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "Thiếu paymentId." });

    const adminDb = getAdminDb();
    try {
      await adminDb.runTransaction(async (transaction) => {
        const paymentRef = adminDb.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) throw new Error("Không tìm thấy phiếu thu.");

        const paymentData = paymentDoc.data()!;
        if (paymentData.status === "Đã duyệt") throw new Error("Phiếu đã được duyệt trước đó.");
        if (paymentData.isCancelled) throw new Error("Phiếu đã bị hủy.");

        const studentRef = adminDb.collection("students").doc(paymentData.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");

        const studentData = studentDoc.data()!;
        const paidAmount = Number(studentData.paidAmount || 0) + Number(paymentData.amount || 0);

        transaction.update(paymentRef, { status: "Đã duyệt" });
        transaction.update(studentRef, {
          paidAmount,
          remainingAmount: Math.max(0, Number(studentData.totalFee || 0) - paidAmount)
        });

        const logId = makeId("log");
        transaction.set(adminDb.collection("auditLogs").doc(logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Duyệt học phí",
          details: `Duyệt phiếu ${paymentId} cho ${studentData.name} [Server Transaction].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Giao dịch duyệt học phí thất bại:", error);
      return res.status(409).json({ error: error.message || "Không thể duyệt phiếu." });
    }
  });

  app.post("/api/payments/cancel", checkAuth, requireRoles("Admin", "Accountant"), async (req, res) => {
    const user = req.currentUserProfile;
    const { paymentId, reason } = req.body;
    if (!paymentId || !String(reason || "").trim()) {
      return res.status(400).json({ error: "Thiếu paymentId hoặc lý do hủy." });
    }

    const adminDb = getAdminDb();
    try {
      await adminDb.runTransaction(async (transaction) => {
        const paymentRef = adminDb.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) throw new Error("Không tìm thấy phiếu thu.");

        const paymentData = paymentDoc.data()!;
        if (paymentData.isCancelled) throw new Error("Phiếu đã được hủy trước đó.");

        const studentRef = adminDb.collection("students").doc(paymentData.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) throw new Error("Không tìm thấy học viên.");

        const studentData = studentDoc.data()!;
        transaction.update(paymentRef, {
          isCancelled: true,
          cancellationReason: String(reason).trim()
        });

        if (paymentData.status === "Đã duyệt") {
          const paidAmount = Math.max(0, Number(studentData.paidAmount || 0) - Number(paymentData.amount || 0));
          transaction.update(studentRef, {
            paidAmount,
            remainingAmount: Math.max(0, Number(studentData.totalFee || 0) - paidAmount)
          });
        }

        const logId = makeId("log");
        transaction.set(adminDb.collection("auditLogs").doc(logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Hủy phiếu thu",
          details: `Hủy phiếu ${paymentId}. Lý do: ${String(reason).trim()} [Server Transaction].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Giao dịch hủy học phí thất bại:", error);
      return res.status(409).json({ error: error.message || "Không thể hủy phiếu." });
    }
  });

  app.post("/api/lessons/batch-confirm", checkAuth, requireRoles("Admin", "Staff"), async (req, res) => {
    const user = req.currentUserProfile;
    const lessons = Array.isArray(req.body.lessons) ? req.body.lessons : [];
    const overrideReason = String(req.body.overrideReason || "").trim();

    if (!lessons.length) {
      return res.status(400).json({ error: "Danh sách ca học trống hoặc không hợp lệ." });
    }

    const adminDb = getAdminDb();
    try {
      const result = await adminDb.runTransaction(async (transaction) => {
        const lessonsSnap = await transaction.get(adminDb.collection("lessons"));
        const instructorsSnap = await transaction.get(adminDb.collection("instructors"));
        const vehiclesSnap = await transaction.get(adminDb.collection("vehicles"));
        const studentsSnap = await transaction.get(adminDb.collection("students"));

        const existingLessons: any[] = [];
        const instructors: any[] = [];
        const vehicles: any[] = [];
        const studentsMap: Record<string, any> = {};

        lessonsSnap.forEach((item) => {
          const lesson = item.data();
          if (!["Học viên báo nghỉ", "Giảng viên báo nghỉ", "Hủy lịch"].includes(lesson.status)) existingLessons.push(lesson);
        });
        instructorsSnap.forEach((item) => instructors.push(item.data()));
        vehiclesSnap.forEach((item) => vehicles.push(item.data()));
        studentsSnap.forEach((item) => { studentsMap[item.id] = item.data(); });

        const conflicts: { index: number; lesson: any; reasons: string[] }[] = [];
        const validToSave: any[] = [];

        lessons.forEach((newLesson, index) => {
          const reasons: string[] = [];
          const start = timeToMinutes(newLesson.startTime);
          const end = timeToMinutes(newLesson.endTime);
          if (!newLesson.studentId || !newLesson.instructorId || !newLesson.vehicleId || !newLesson.date) reasons.push("Thiếu học viên, giảng viên, xe hoặc ngày học.");
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reasons.push("Giờ kết thúc phải lớn hơn giờ bắt đầu.");

          const teacher = instructors.find((item) => item.id === newLesson.instructorId);
          const vehicle = vehicles.find((item) => item.id === newLesson.vehicleId);
          const student = studentsMap[newLesson.studentId];

          if (!student) reasons.push("Không tìm thấy học viên hợp lệ.");
          if (!teacher) reasons.push("Không tìm thấy giảng viên hợp lệ.");
          if (!vehicle) reasons.push("Không tìm thấy xe hợp lệ.");

          if (teacher) {
            if (start < timeToMinutes(teacher.workingHours?.start) || end > timeToMinutes(teacher.workingHours?.end)) reasons.push(`Ngoài giờ làm việc của GV ${teacher.name}.`);
            if (Array.isArray(teacher.daysOff) && teacher.daysOff.includes(newLesson.date)) reasons.push(`GV ${teacher.name} nghỉ phép ngày ${newLesson.date}.`);
            if (Array.isArray(teacher.workingDays) && !teacher.workingDays.includes(getLocalWeekday(newLesson.date))) reasons.push(`GV ${teacher.name} không làm việc trong ngày đã chọn.`);
          }

          if (vehicle && vehicle.status !== "Sẵn sàng") reasons.push(`Xe ${vehicle.name} (${vehicle.plate}) hiện ở trạng thái ${vehicle.status}.`);

          for (const existing of [...existingLessons, ...validToSave]) {
            if (existing.id === newLesson.id || existing.date !== newLesson.date) continue;
            if (!doIntervalsOverlap(newLesson.startTime, newLesson.endTime, existing.startTime, existing.endTime)) continue;
            if (existing.studentId === newLesson.studentId) reasons.push(`Học viên bị trùng lịch ${existing.startTime}-${existing.endTime}.`);
            if (existing.instructorId === newLesson.instructorId) reasons.push(`Giảng viên bị trùng lịch ${existing.startTime}-${existing.endTime}.`);
            if (existing.vehicleId === newLesson.vehicleId) reasons.push(`Xe bị trùng lịch ${existing.startTime}-${existing.endTime}.`);
          }

          const normalized = {
            ...newLesson,
            id: newLesson.id && !String(newLesson.id).startsWith("sug_") ? newLesson.id : makeId("less"),
            status: "Đã xác nhận",
            attendanceStatus: "Chưa điểm danh",
            resultNote: newLesson.resultNote || ""
          };

          if (reasons.length) conflicts.push({ index, lesson: normalized, reasons: [...new Set(reasons)] });
          else validToSave.push(normalized);
        });

        if (conflicts.length && (user.role !== "Admin" || !overrideReason)) {
          return {
            success: false,
            hasConflicts: true,
            conflicts,
            message: user.role === "Admin"
              ? "Phát hiện xung đột. Vui lòng nhập lý do ghi đè."
              : "Phát hiện xung đột. Chỉ Admin được phép ghi đè."
          };
        }

        const finalLessons = conflicts.length ? lessons.map((lesson) => ({
          ...lesson,
          id: lesson.id && !String(lesson.id).startsWith("sug_") ? lesson.id : makeId("less"),
          status: "Đã xác nhận",
          attendanceStatus: "Chưa điểm danh",
          resultNote: lesson.resultNote || ""
        })) : validToSave;

        finalLessons.forEach((lesson) => {
          transaction.set(adminDb.collection("lessons").doc(lesson.id), lesson);
        });

        const logId = makeId("log");
        transaction.set(adminDb.collection("auditLogs").doc(logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          action: conflicts.length ? "Ghi đè lịch học hàng loạt" : "Xếp lịch học hàng loạt",
          details: `Lưu ${finalLessons.length} ca học.${overrideReason ? ` Lý do ghi đè: ${overrideReason}` : ""}`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });

        return {
          success: true,
          committedCount: finalLessons.length,
          hasConflicts: Boolean(conflicts.length)
        };
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Lưu lịch hàng loạt thất bại:", error);
      return res.status(409).json({ error: error.message || "Không thể lưu lịch hàng loạt." });
    }
  });

  app.post("/api/ocr-card", checkAuthOrLocalDemo, requireRoles("Admin", "Staff"), async (req, res) => {
    const user = req.currentUserProfile;
    const rateKey = user.uid || req.ip || "unknown";
    const now = Date.now();
    const currentRate = ocrRateLimit.get(rateKey);

    if (!currentRate || now - currentRate.windowStartedAt > 60_000) {
      ocrRateLimit.set(rateKey, { count: 1, windowStartedAt: now });
    } else {
      currentRate.count += 1;
      if (currentRate.count > 5) {
        return res.status(429).json({ error: "Bạn thao tác OCR quá nhanh. Vui lòng thử lại sau một phút." });
      }
    }

    try {
      const { image, cardType } = req.body;
      const match = String(image || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return res.status(400).json({ error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP hợp lệ." });

      const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
      const base64Data = match[2];
      if (Buffer.byteLength(base64Data, "base64") > 4 * 1024 * 1024) {
        return res.status(413).json({ error: "Ảnh vượt quá giới hạn 4 MB." });
      }

      const prompt = `Đọc ảnh ${String(cardType || "CCCD").slice(0, 80)} của học viên Việt Nam. Trích xuất chính xác họ tên viết hoa, ngày sinh YYYY-MM-DD và địa chỉ thường trú. Nếu không nhìn thấy dữ liệu thì để chuỗi rỗng. Không được suy đoán.`;
      const response = await getGeminiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ inlineData: { mimeType, data: base64Data } }, prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING },
              address: { type: Type.STRING },
              dob: { type: Type.STRING }
            },
            required: ["fullName", "address", "dob"]
          }
        }
      });

      return res.json({ success: true, data: JSON.parse((response.text || "{}").trim()) });
    } catch (error: any) {
      console.error("Gemini OCR server error:", error);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on port ${PORT}`);
  });
}

startServer();
