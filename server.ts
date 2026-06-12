import express from "express";
import path from "path";
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

let aiInstance: any = null;

function getGeminiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in the environment environment variables.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// Initialize Firebase Admin SDK for Cloud Run ADC or local configurations
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const configPath = path.join(process.cwd(), "src", "firebase-applet-config.json");
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (e) {
  console.error("Lỗi đọc cấu hình Firebase:", e);
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

function getAdminDb() {
  const dbId = firebaseConfig.firestoreDatabaseId;
  const app = admin.apps[0] || admin.app();
  return dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);
}

async function lookupFirebaseAccountByIdToken(idToken: string) {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey) {
    throw new Error("Thiếu Firebase Web API Key.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ idToken }),
        signal: controller.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        "Firebase Auth REST từ chối ID Token."
      );
    }

    const account = data?.users?.[0];
    if (!account?.localId || account.disabled === true) {
      throw new Error("Tài khoản Firebase không hợp lệ hoặc đã bị khóa.");
    }

    return {
      uid: account.localId,
      email: account.email || "",
      displayName: account.displayName || account.email || "Cloud User"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchUserDocViaRest(idToken: string, uid: string) {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi truy vấn REST Firestore: ${response.status}`);
    }

    if (!data.fields) {
      return null;
    }

    const unwrappedValue = (valObj: any): any => {
      if (!valObj) return null;
      if ('stringValue' in valObj) return valObj.stringValue;
      if ('booleanValue' in valObj) return valObj.booleanValue;
      if ('integerValue' in valObj) return Number(valObj.integerValue);
      if ('doubleValue' in valObj) return Number(valObj.doubleValue);
      if ('timestampValue' in valObj) return valObj.timestampValue;
      if ('mapValue' in valObj) {
        const mapRes: any = {};
        const mapFields = valObj.mapValue.fields || {};
        for (const k of Object.keys(mapFields)) {
          mapRes[k] = unwrappedValue(mapFields[k]);
        }
        return mapRes;
      }
      if ('arrayValue' in valObj) {
        const arr = valObj.arrayValue.values || [];
        return arr.map((item: any) => unwrappedValue(item));
      }
      return null;
    };

    const result: any = {};
    for (const key of Object.keys(data.fields)) {
      result[key] = unwrappedValue(data.fields[key]);
    }
    return result;
  } catch (error: any) {
    console.error("Lỗi fetchUserDocViaRest:", error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function wrapFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (typeof val === "boolean") {
    return { booleanValue: val };
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    } else {
      return { doubleValue: val };
    }
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((v) => wrapFirestoreValue(v))
      }
    };
  }
  if (typeof val === "object") {
    const fields: any = {};
    for (const key of Object.keys(val)) {
      fields[key] = wrapFirestoreValue(val[key]);
    }
    return {
      mapValue: {
        fields
      }
    };
  }
  return { nullValue: null };
}

async function restGetDoc(token: string, collection: string, docId: string): Promise<any | null> {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal
    });

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi restGetDoc: ${response.status}`);
    }

    if (!data.fields) return null;

    const unwrappedValue = (valObj: any): any => {
      if (!valObj) return null;
      if ('stringValue' in valObj) return valObj.stringValue;
      if ('booleanValue' in valObj) return valObj.booleanValue;
      if ('integerValue' in valObj) return Number(valObj.integerValue);
      if ('doubleValue' in valObj) return Number(valObj.doubleValue);
      if ('timestampValue' in valObj) return valObj.timestampValue;
      if ('mapValue' in valObj) {
        const mapRes: any = {};
        const mapFields = valObj.mapValue.fields || {};
        for (const k of Object.keys(mapFields)) {
          mapRes[k] = unwrappedValue(mapFields[k]);
        }
        return mapRes;
      }
      if ('arrayValue' in valObj) {
        const arr = valObj.arrayValue.values || [];
        return arr.map((item: any) => unwrappedValue(item));
      }
      return null;
    };

    const result: any = {};
    for (const key of Object.keys(data.fields)) {
      result[key] = unwrappedValue(data.fields[key]);
    }
    result.__updateTime = data.updateTime;
    return result;
  } catch (error: any) {
    console.error(`Lỗi restGetDoc cho ${collection}/${docId}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFirestoreDocumentName(collection: string, docId: string): string {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `projects/${projectId}/databases/${databaseId}/documents/${collection}/${docId}`;
}

async function restCommit(token: string, writes: any[]): Promise<any> {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents:commit`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });
  const data = await response.json();
  if (!response.ok) {
    const err: any = new Error(
      data?.error?.message || `Firestore REST commit failed: ${response.status}`
    );
    err.code = data?.error?.status || response.status;
    throw err;
  }
  return data;
}

function wrapFirestoreFields(data: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, wrapFirestoreValue(value)])
  );
}

const FIXED_INSTALLMENT_CATEGORIES = ['Đợt 1', 'Đợt 2', 'Đợt 3'] as const;
const INSTALLMENT_KEY_BY_CATEGORY = {
  'Đợt 1': 'dot1',
  'Đợt 2': 'dot2',
  'Đợt 3': 'dot3'
} as const;

function getInstallmentLockId(studentId: string, category: string): string | null {
  const key = INSTALLMENT_KEY_BY_CATEGORY[
    category as keyof typeof INSTALLMENT_KEY_BY_CATEGORY
  ];
  return key ? `${studentId}_${key}` : null;
}

async function restSetDoc(token: string, collection: string, docId: string, data: any): Promise<void> {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
  
  const keys = Object.keys(data);
  const queryParams = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${queryParams}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const fields: any = {};
  for (const key of keys) {
    fields[key] = wrapFirestoreValue(data[key]);
  }

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields }),
      signal: controller.signal
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData?.error?.message || `Lỗi restSetDoc: ${response.status}`);
    }
  } catch (error: any) {
    console.error(`Lỗi restSetDoc cho ${collection}/${docId}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function restListDocs(token: string, collection: string): Promise<any[]> {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collection)}?pageSize=300`;

  try {
    const results: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let loopCount = 0;

    const unwrappedValue = (valObj: any): any => {
      if (!valObj) return null;
      if ('stringValue' in valObj) return valObj.stringValue;
      if ('booleanValue' in valObj) return valObj.booleanValue;
      if ('integerValue' in valObj) return Number(valObj.integerValue);
      if ('doubleValue' in valObj) return Number(valObj.doubleValue);
      if ('timestampValue' in valObj) return valObj.timestampValue;
      if ('mapValue' in valObj) {
        const mapRes: any = {};
        const mapFields = valObj.mapValue.fields || {};
        for (const k of Object.keys(mapFields)) {
          mapRes[k] = unwrappedValue(mapFields[k]);
        }
        return mapRes;
      }
      if ('arrayValue' in valObj) {
        const arr = valObj.arrayValue.values || [];
        return arr.map((item: any) => unwrappedValue(item));
      }
      return null;
    };

    do {
      const url = nextPageToken ? `${baseUrl}&pageToken=${encodeURIComponent(nextPageToken)}` : baseUrl;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `Lỗi restListDocs: ${response.status}`);
        }

        const documents = data.documents || [];
        for (const doc of documents) {
          if (!doc.fields) continue;
          const item: any = {};
          for (const key of Object.keys(doc.fields)) {
            item[key] = unwrappedValue(doc.fields[key]);
          }
          results.push(item);
        }

        nextPageToken = data.nextPageToken;
      } finally {
        clearTimeout(timeoutId);
      }
      loopCount++;
    } while (nextPageToken && loopCount < 50);

    return results;
  } catch (error: any) {
    console.error(`Lỗi restListDocs cho ${collection}:`, error);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set payload size limits to securely support base64 identity card images
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Middleware checking authorization and fetching profile from Firestore
  async function checkAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Không tìm thấy mã xác thực Authorization." });
    }
    const token = authHeader.split(" ")[1];
    try {
      let uid: string;
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
      } catch (authErr) {
        console.log("verifyIdToken lookup bypass index; attempting fallback REST lookup...");
        const account = await lookupFirebaseAccountByIdToken(token);
        uid = account.uid;
      }
      
      let userData: any = null;
      try {
        const adminDb = getAdminDb();
        const userDoc = await adminDb.collection("users").doc(uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
        }
      } catch (dbErr: any) {
        const isPermissionError = dbErr.message?.includes("permissions") || dbErr.message?.includes("PERMISSION_DENIED") || dbErr.code === 7;
        if (isPermissionError) {
          console.log("adminDb query bypass index; attempting fallback REST doc fetch...");
          userData = await fetchUserDocViaRest(token, uid);
        } else {
          throw dbErr;
        }
      }

      if (!userData) {
        return res.status(403).json({ error: "Tài khoản của bạn chưa được cấp quyền truy cập hệ thống. Vui lòng liên hệ Admin để gán quyền." });
      }
      req.currentUserProfile = userData;
      (req as any).userToken = token;
      next();
    } catch (error: any) {
      console.error("Xác thực ID Token thất bại:", error);
      return res.status(401).json({ error: "Xác thực không hợp lệ hoặc đã hết hạn." });
    }
  }

  async function checkOcrAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Không tìm thấy mã xác thực Authorization."
      });
    }

    const token = authHeader.split(" ")[1];

    try {
      let decodedToken: any;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (authErr) {
        console.log("verifyIdToken (OCR) failed, trying fallback REST lookup...");
        const account = await lookupFirebaseAccountByIdToken(token);
        decodedToken = {
          uid: account.uid,
          email: account.email,
          name: account.displayName
        };
      }

      req.currentUserProfile = {
        uid: decodedToken.uid,
        email: decodedToken.email || "",
        displayName:
          decodedToken.name ||
          decodedToken.email ||
          "Cloud User",
        role: "AuthenticatedUser"
      };

      next();
    } catch (error: any) {
      console.error("OCR ID Token verification failed:", {
        name: error?.name,
        message: error?.message,
        code: error?.code
      });

      return res.status(401).json({
        error: "Phiên đăng nhập OCR không hợp lệ. Vui lòng đăng xuất và đăng nhập lại."
      });
    }
  }

  // Middleware validating Admin-only role for critical user provisioning tasks
  async function checkAdmin(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Không tìm thấy mã xác thực Authorization." });
    }
    const token = authHeader.split(" ")[1];
    try {
      let uid: string;
      let decodedToken: any = null;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
      } catch (authErr) {
        console.log("verifyIdToken (admin) lookup bypass index; attempting fallback REST lookup...");
        const account = await lookupFirebaseAccountByIdToken(token);
        uid = account.uid;
        decodedToken = { uid, email: account.email };
      }
      
      let userData: any = null;
      try {
        const adminDb = getAdminDb();
        const userDoc = await adminDb.collection("users").doc(uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
        }
      } catch (dbErr: any) {
        const isPermissionError = dbErr.message?.includes("permissions") || dbErr.message?.includes("PERMISSION_DENIED") || dbErr.code === 7;
        if (isPermissionError) {
          console.log("adminDb query (admin) bypass index; attempting fallback REST doc fetch...");
          userData = await fetchUserDocViaRest(token, uid);
        } else {
          throw dbErr;
        }
      }

      if (!userData || userData.role !== "Admin") {
        return res.status(403).json({ error: "Quyền truy cập bị từ chối: Yêu cầu đặc quyền Admin." });
      }
      req.adminUser = decodedToken;
      (req as any).userToken = token;
      next();
    } catch (error: any) {
      console.error("Xác thực đặc quyền Admin thất bại:", error);
      return res.status(401).json({ error: "Xác thực không hợp lệ hoặc đã hết hạn." });
    }
  }

  // Helper calculation definitions
  function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function doIntervalsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    return timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(start2) < timeToMinutes(end1);
  }

  // --- SECURE APIs ---

  // 1. Provisions new users safely under complete server-side access bounds
  app.post("/api/admin/create-user", checkAdmin, async (req, res) => {
    const { email, password, displayName, role } = req.body;
    if (!email || !password || !displayName || !role) {
      return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin: email, password, displayName, role." });
    }
    if (!["Admin", "Staff", "Instructor", "Accountant"].includes(role)) {
      return res.status(400).json({ error: "Vai trò người dùng được yêu cầu không hợp lệ." });
    }
    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });
      
      const adminDb = getAdminDb();
      const userProfile = {
        uid: userRecord.uid,
        email,
        displayName,
        role,
      };

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const logData = {
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Tạo tài khoản thành viên",
        details: `Quản trị viên ${req.adminUser.email} đã tạo tài khoản thành viên mới: ${displayName} (${email}) với vai trò ${role}.`,
        userId: req.adminUser.uid,
        userName: req.adminUser.email || "Admin",
        userRole: "Admin"
      };

      try {
        await adminDb.collection("users").doc(userRecord.uid).set(userProfile);
        await adminDb.collection("auditLogs").doc(logId).set(logData);
      } catch (dbErr: any) {
        const isPermissionError = dbErr.message?.includes("permissions") || dbErr.message?.includes("PERMISSION_DENIED") || dbErr.code === 7;
        const token = (req as any).userToken;
        if (isPermissionError && token) {
          console.log("adminDb set in create-user failed due to permission; starting REST fallback...");
          await restSetDoc(token, "users", userRecord.uid, userProfile);
          await restSetDoc(token, "auditLogs", logId, logData);
        } else {
          throw dbErr;
        }
      }

      return res.json({ success: true, user: userProfile });
    } catch (error: any) {
      console.error("Lỗi thiết lập tài khoản thành viên mới:", error);
      return res.status(500).json({ error: error.message || "Lỗi máy chủ khi thiết lập tài khoản." });
    }
  });

  app.post("/api/payments/create", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff", "Accountant"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Giáo vụ tuyển sinh hoặc kế toán mới được phép thu học phí." });
    }

    const { studentId, paymentDate, amount, method, category, receiver, notes, requestId } = req.body;
    if (!studentId || amount === undefined || amount === null) {
      return res.status(400).json({ error: "Bắt buộc cung cấp mã học viên và số tiền thanh toán." });
    }

    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return res.status(400).json({ error: "Bắt buộc cung cấp requestId duy nhất để đảm bảo tính duy nhất." });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Thanh toán không hợp lệ: Số tiền phải là số hữu hạn lớn hơn 0." });
    }

    const adminDb = getAdminDb();
    const token = (req as any).userToken;

    const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const payId = `pay_${safeRequestId}`;
    const isStaff = user.role === "Staff";
    const shouldApproveImmediately = !isStaff && (user.role === "Admin" || user.role === "Accountant" || (category !== "Thanh toán bổ sung" && category !== "Khác"));
    const freshPayment = {
      id: payId,
      studentId,
      paymentDate: paymentDate || new Date().toISOString().split("T")[0],
      amount: numAmount,
      method: method || "Chuyển khoản",
      category: category || "Đợt 1",
      receiver: receiver || user.displayName,
      notes: notes || "",
      isCancelled: false,
      createdAt: new Date().toISOString(),
      createdBy: user.email,
      status: shouldApproveImmediately ? "Đã duyệt" : "Chờ duyệt",
      requestId: requestId
    };

    try {
      const txResult = await adminDb.runTransaction(async (transaction) => {
        const paymentRef = adminDb.collection("payments").doc(payId);
        const paymentDoc = await transaction.get(paymentRef);
        if (paymentDoc.exists) {
          return { status: "already_processed", payment: paymentDoc.data() };
        }

        const studentRef = adminDb.collection("students").doc(studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) {
          throw new Error("Không tìm thấy học viên trong cơ sở dữ liệu.");
        }
        const studentData = studentDoc.data()!;

        // Lock check
        const lockId = getInstallmentLockId(studentId, category);
        if (lockId) {
          const lockRef = adminDb.collection("paymentInstallmentLocks").doc(lockId);
          const lockDoc = await transaction.get(lockRef);
          if (lockDoc.exists) {
            const err = new Error(`Học viên đã có biên lai ${category} đang hiệu lực. Hãy hủy phiếu cũ trước khi ghi lại.`);
            (err as any).status = 409;
            throw err;
          }
          transaction.set(lockRef, {
            id: lockId,
            studentId,
            category,
            paymentId: payId,
            createdAt: new Date().toISOString()
          });
        }

        // Save payment record
        transaction.set(paymentRef, freshPayment);

        // Update student balances only if approved immediately
        if (freshPayment.status === "Đã duyệt") {
          const newPaid = Number(studentData.paidAmount || 0) + Number(amount);
          const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - newPaid);
          transaction.update(studentRef, {
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            reminderStatus: "Chưa nhắc"
          });
        }

        // Write audit log
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const logRef = adminDb.collection("auditLogs").doc(logId);
        transaction.set(logRef, {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Thu học phí",
          details: `Ghi nhận thu học phí từ học viên ${studentData.name}: +${Number(amount).toLocaleString('vi-VN')} đ cho hạng mục '${category}' (${freshPayment.status}) [Giao dịch Server].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });

        return { status: "success", payment: freshPayment };
      });

      if (txResult.status === "already_processed") {
        return res.json({ success: true, payment: txResult.payment, duplicated: true });
      }
      return res.json({ success: true, payment: txResult.payment });
    } catch (error: any) {
      if (error.status === 409 || error.code === 409 || error.message?.includes("đã có biên lai")) {
        return res.status(409).json({ error: error.message });
      }
      const isPermissionError = error.message?.includes("permissions") || error.message?.includes("PERMISSION_DENIED") || error.code === 7;
      if (isPermissionError && token) {
        console.log("adminDb transaction in payments/create failed due to permission; starting REST fallback...");
        if (user.role !== "Admin") {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin." });
        }
        try {
          // Idempotency check
          const existingPayment = await restGetDoc(token, "payments", payId);
          if (existingPayment) {
            console.log(`Idempotency hit (REST fallback with getDoc)! PayId ${payId} already processed.`);
            return res.json({ success: true, payment: existingPayment, duplicated: true });
          }

          // 1. Get student document
          const studentData = await restGetDoc(token, "students", studentId);
          if (!studentData) {
            return res.status(404).json({ error: "Không tìm thấy học viên trong cơ sở dữ liệu." });
          }

          // 2. Lock check
          const lockId = getInstallmentLockId(studentId, category);
          if (lockId) {
            const existingLock = await restGetDoc(token, "paymentInstallmentLocks", lockId);
            if (existingLock) {
              return res.status(409).json({ error: `Học viên đã có biên lai ${category} đang hiệu lực. Hãy hủy phiếu cũ trước khi ghi lại.` });
            }
          }

          // Assemble atomic writes
          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("payments", payId),
              fields: wrapFirestoreFields(freshPayment)
            },
            currentDocument: {
              exists: false
            }
          });

          if (lockId) {
            writes.push({
              update: {
                name: getFirestoreDocumentName("paymentInstallmentLocks", lockId),
                fields: wrapFirestoreFields({
                  id: lockId,
                  studentId,
                  category,
                  paymentId: payId,
                  createdAt: new Date().toISOString()
                })
              },
              currentDocument: {
                exists: false
              }
            });
          }

          if (freshPayment.status === "Đã duyệt") {
            const newPaid = Number(studentData.paidAmount || 0) + Number(amount);
            const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - newPaid);
            const updatedStudentFields = {
              ...studentData,
              paidAmount: newPaid,
              remainingAmount: newRemaining,
              reminderStatus: "Chưa nhắc"
            };
            const updateTime = studentData.__updateTime;
            delete updatedStudentFields.__updateTime;

            writes.push({
              update: {
                name: getFirestoreDocumentName("students", studentId),
                fields: wrapFirestoreFields(updatedStudentFields)
              },
              currentDocument: {
                updateTime: updateTime
              }
            });
          }

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Thu học phí",
            details: `Ghi nhận thu học phí từ học viên ${studentData.name}: +${Number(amount).toLocaleString('vi-VN')} đ cho hạng mục '${category}' (${freshPayment.status}) [Giao dịch Server REST].`,
            userId: user.uid,
            userName: user.displayName,
            userRole: user.role
          };
          writes.push({
            update: {
              name: getFirestoreDocumentName("auditLogs", logId),
              fields: wrapFirestoreFields(freshLog)
            },
            currentDocument: {
              exists: false
            }
          });

          await restCommit(token, writes);
          return res.json({ success: true, payment: freshPayment });
        } catch (restErr: any) {
          console.error("Giao dịch ghi thu học phí REST thất bại:", restErr);
          if (restErr.status === 409 || restErr.code === 409 || restErr.message?.includes("ALREADY_EXISTS") || restErr.message?.includes("already exists")) {
            return res.status(409).json({ error: `Học viên đã có biên lai ${category} đang hiệu lực. Hãy hủy phiếu cũ trước khi ghi lại.` });
          }
          return res.status(500).json({ error: restErr.message || "Xảy ra sự cố khi ghi biên lai học phí (REST)." });
        }
      } else {
        console.error("Giao dịch ghi thu học phí thất bại:", error);
        return res.status(500).json({ error: error.message || "Xảy ra sự cố khi ghi biên lai học phí." });
      }
    }
  });

  // 3. Approves raw records securely, recalculating student parameters inside transaction
  app.post("/api/payments/approve", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Accountant"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Yêu cầu đặc quyền Admin hoặc Kế toán để duyệt biên lai tài chính." });
    }

    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "Vui lòng cung cập mã thanh toán paymentId cần duyệt." });
    }

    const adminDb = getAdminDb();

    const token = (req as any).userToken;
    try {
      await adminDb.runTransaction(async (transaction) => {
        const paymentRef = adminDb.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) {
          throw new Error("Không tìm thấy chứng từ thu chi.");
        }
        const paymentData = paymentDoc.data()!;

        if (paymentData.status === "Đã duyệt") {
          throw new Error("Biên lai học phí đã được duyệt trước đó.");
        }
        if (paymentData.isCancelled) {
          throw new Error("Biên lai đã bị hủy từ trước, không thể duyệt.");
        }

        const studentRef = adminDb.collection("students").doc(paymentData.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) {
          throw new Error("Học viên sở hữu biên lai không tồn tại.");
        }
        const studentData = studentDoc.data()!;

        // Commit state
        transaction.update(paymentRef, { status: "Đã duyệt" });

        // Safely adjust student ledger
        const newPaid = Number(studentData.paidAmount || 0) + Number(paymentData.amount || 0);
        const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - newPaid);
        transaction.update(studentRef, {
          paidAmount: newPaid,
          remainingAmount: newRemaining
        });

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const logRef = adminDb.collection("auditLogs").doc(logId);
        transaction.set(logRef, {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Duyệt học phí",
          details: `Phê duyệt thành công biên lai học phí ID ${paymentId} số tiền: ${Number(paymentData.amount).toLocaleString('vi-VN')} đ cho HV ${studentData.name} [Giao dịch Server].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true });
    } catch (error: any) {
      const isPermissionError = error.message?.includes("permissions") || error.message?.includes("PERMISSION_DENIED") || error.code === 7;
      if (isPermissionError && token) {
        console.log("adminDb transaction in payments/approve failed due to permission; starting REST fallback...");
        if (user.role !== "Admin") {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin." });
        }
        try {
          const paymentData = await restGetDoc(token, "payments", paymentId);
          if (!paymentData) {
            return res.status(404).json({ error: "Không tìm thấy chứng từ thu chi." });
          }

          if (paymentData.status === "Đã duyệt") {
            return res.status(400).json({ error: "Biên lai học phí đã được duyệt trước đó." });
          }
          if (paymentData.isCancelled) {
            return res.status(400).json({ error: "Biên lai đã bị hủy từ trước, không thể duyệt." });
          }

          const studentData = await restGetDoc(token, "students", paymentData.studentId);
          if (!studentData) {
            return res.status(404).json({ error: "Học viên sở hữu biên lai không tồn tại." });
          }

          // Update payment status
          const updatedPayment = {
            ...paymentData,
            status: "Đã duyệt"
          };
          const paymentUpdateTime = paymentData.__updateTime;
          delete updatedPayment.__updateTime;

          // Update student ledger
          const newPaid = Number(studentData.paidAmount || 0) + Number(paymentData.amount || 0);
          const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - newPaid);
          const updatedStudentFields = {
            ...studentData,
            paidAmount: newPaid,
            remainingAmount: newRemaining
          };
          const studentUpdateTime = studentData.__updateTime;
          delete updatedStudentFields.__updateTime;

          // Write audit log
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Duyệt học phí",
            details: `Phê duyệt thành công biên lai học phí ID ${paymentId} số tiền: ${Number(paymentData.amount).toLocaleString('vi-VN')} đ cho HV ${studentData.name} [Giao dịch Server REST].`,
            userId: user.uid,
            userName: user.displayName,
            userRole: user.role
          };

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("payments", paymentId),
              fields: wrapFirestoreFields(updatedPayment)
            },
            currentDocument: {
              updateTime: paymentUpdateTime
            }
          });

          writes.push({
            update: {
              name: getFirestoreDocumentName("students", paymentData.studentId),
              fields: wrapFirestoreFields(updatedStudentFields)
            },
            currentDocument: {
              updateTime: studentUpdateTime
            }
          });

          writes.push({
            update: {
              name: getFirestoreDocumentName("auditLogs", logId),
              fields: wrapFirestoreFields(freshLog)
            },
            currentDocument: {
              exists: false
            }
          });

          await restCommit(token, writes);
          return res.json({ success: true });
        } catch (restErr: any) {
          console.error("Giao dịch duyệt học phí REST thất bại:", restErr);
          return res.status(500).json({ error: restErr.message || "Lỗi khi duyệt chứng từ thanh toán (REST)." });
        }
      } else {
        console.error("Giao dịch duyệt học phí thất bại:", error);
        return res.status(500).json({ error: error.message || "Lỗi khi duyệt chứng từ thanh toán." });
      }
    }
  });

  // 4. Cancels payments securely, reversing balances on student document in transaction
  app.post("/api/payments/cancel", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Accountant"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Giáo vụ tuyển sinh không được phép hủy chứng từ doanh thu." });
    }

    const { paymentId, reason } = req.body;
    if (!paymentId || !reason) {
      return res.status(400).json({ error: "Bắt buộc cung cấp mã paymentId và lý do hủy." });
    }

    const adminDb = getAdminDb();

    const token = (req as any).userToken;
    try {
      await adminDb.runTransaction(async (transaction) => {
        const paymentRef = adminDb.collection("payments").doc(paymentId);
        const paymentDoc = await transaction.get(paymentRef);
        if (!paymentDoc.exists) {
          throw new Error("Không tìm thấy chứng từ cần hủy.");
        }
        const paymentData = paymentDoc.data()!;

        if (paymentData.isCancelled) {
          throw new Error("Biên lai học phí đã được hủy trước đó.");
        }

        const studentRef = adminDb.collection("students").doc(paymentData.studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) {
          throw new Error("Học viên sở hữu biên lai không tồn tại.");
        }
        const studentData = studentDoc.data()!;

        // Update payment cancellation values
        transaction.update(paymentRef, {
          isCancelled: true,
          cancellationReason: reason
        });

        // Safely reverse student ledger if already approved prior
        if (paymentData.status === "Đã duyệt") {
          const revPaid = Math.max(0, Number(studentData.paidAmount || 0) - Number(paymentData.amount || 0));
          const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - revPaid);
          transaction.update(studentRef, {
            paidAmount: revPaid,
            remainingAmount: newRemaining
          });
        }

        // Delete installment lock if category is Đợt 1, 2, 3
        const lockId = getInstallmentLockId(paymentData.studentId, paymentData.category);
        if (lockId) {
          const lockRef = adminDb.collection("paymentInstallmentLocks").doc(lockId);
          transaction.delete(lockRef);
        }

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const logRef = adminDb.collection("auditLogs").doc(logId);
        transaction.set(logRef, {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Hủy Biên Lai Doanh Thu",
          details: `Yêu cầu hủy biên lai học phí ID ${paymentId} thành công. Chênh hoàn: -${Number(paymentData.amount).toLocaleString('vi-VN')} đ. Lý do: ${reason} [Giao dịch Server].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true });
    } catch (error: any) {
      const isPermissionError = error.message?.includes("permissions") || error.message?.includes("PERMISSION_DENIED") || error.code === 7;
      if (isPermissionError && token) {
        console.log("adminDb transaction in payments/cancel failed due to permission; starting REST fallback...");
        if (user.role !== "Admin") {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin." });
        }
        try {
          const paymentData = await restGetDoc(token, "payments", paymentId);
          if (!paymentData) {
            return res.status(404).json({ error: "Không tìm thấy chứng từ cần hủy." });
          }

          if (paymentData.isCancelled) {
            return res.status(400).json({ error: "Biên lai học phí đã được hủy trước đó." });
          }

          const studentData = await restGetDoc(token, "students", paymentData.studentId);
          if (!studentData) {
            return res.status(404).json({ error: "Học viên sở hữu biên lai không tồn tại." });
          }

          // Update payment cancellation
          const updatedPayment = {
            ...paymentData,
            isCancelled: true,
            cancellationReason: reason
          };
          const paymentUpdateTime = paymentData.__updateTime;
          delete updatedPayment.__updateTime;

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("payments", paymentId),
              fields: wrapFirestoreFields(updatedPayment)
            },
            currentDocument: {
              updateTime: paymentUpdateTime
            }
          });

          // Reverse student ledger if already approved prior
          if (paymentData.status === "Đã duyệt") {
            const revPaid = Math.max(0, Number(studentData.paidAmount || 0) - Number(paymentData.amount || 0));
            const newRemaining = Math.max(0, Number(studentData.totalFee || 0) - revPaid);
            const updatedStudentFields = {
              ...studentData,
              paidAmount: revPaid,
              remainingAmount: newRemaining
            };
            const studentUpdateTime = studentData.__updateTime;
            delete updatedStudentFields.__updateTime;

            writes.push({
              update: {
                name: getFirestoreDocumentName("students", paymentData.studentId),
                fields: wrapFirestoreFields(updatedStudentFields)
              },
              currentDocument: {
                updateTime: studentUpdateTime
              }
            });
          }

          // Delete installment lock if category is Đợt 1, 2, 3
          const lockId = getInstallmentLockId(paymentData.studentId, paymentData.category);
          if (lockId) {
            writes.push({
              delete: getFirestoreDocumentName("paymentInstallmentLocks", lockId)
            });
          }

          // Write audit log
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Hủy Biên Lai Doanh Thu",
            details: `Yêu cầu hủy biên lai học phí ID ${paymentId} thành công. Chênh hoàn: -${Number(paymentData.amount).toLocaleString('vi-VN')} đ. Lý do: ${reason} [Giao dịch Server REST].`,
            userId: user.uid,
            userName: user.displayName,
            userRole: user.role
          };
          writes.push({
            update: {
              name: getFirestoreDocumentName("auditLogs", logId),
              fields: wrapFirestoreFields(freshLog)
            },
            currentDocument: {
              exists: false
            }
          });

          await restCommit(token, writes);
          return res.json({ success: true });
        } catch (restErr: any) {
          console.error("Giao dịch hủy học phí REST thất bại:", restErr);
          return res.status(500).json({ error: restErr.message || "Lỗi khi hủy biên lai học phí (REST)." });
        }
      } else {
        console.error("Giao dịch hủy học phí thất bại:", error);
        return res.status(500).json({ error: error.message || "Lỗi khi hủy biên lai học phí." });
      }
    }
  });

  // 4b. Reconciles student ledger, calculating correct payments from single source of truth (approved, not cancelled)
  app.post("/api/payments/reconcile-student", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Accountant"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Chỉ quản trị viên hoặc kế toán mới được phép đối soát công nợ." });
    }

    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "Vui lòng cung cấp mã học viên studentId cần đối soát." });
    }

    const adminDb = getAdminDb();
    const token = (req as any).userToken;

    try {
      let paidAmount = 0;
      let remainingAmount = 0;
      let studentName = "";

      await adminDb.runTransaction(async (transaction) => {
        const studentRef = adminDb.collection("students").doc(studentId);
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists) {
          throw new Error("Không tìm thấy học viên trong cơ sở dữ liệu.");
        }
        const studentData = studentDoc.data()!;
        studentName = studentData.name || "";

        const paymentsSnap = await adminDb.collection("payments").where("studentId", "==", studentId).get();
        const validPayments = paymentsSnap.docs.map(doc => doc.data()).filter(p => p.status === "Đã duyệt" && p.isCancelled === false);
        paidAmount = validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        remainingAmount = Math.max(0, Number(studentData.totalFee || 0) - paidAmount);

        transaction.update(studentRef, {
          paidAmount,
          remainingAmount
        });

        // Write audit log
        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const logRef = adminDb.collection("auditLogs").doc(logId);
        transaction.set(logRef, {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Đối soát công nợ học viên",
          details: `Thực hiện đối soát lại công nợ học viên ${studentName} ID ${studentId} thành công. Số tiền đã nộp hợp lệ: ${paidAmount.toLocaleString('vi-VN')} đ, dư nợ còn lại: ${remainingAmount.toLocaleString('vi-VN')} đ [Giao dịch Server].`,
          userId: user.uid,
          userName: user.displayName,
          userRole: user.role
        });
      });

      return res.json({ success: true, paidAmount, remainingAmount });
    } catch (error: any) {
      const isPermissionError = error.message?.includes("permissions") || error.message?.includes("PERMISSION_DENIED") || error.code === 7;
      if (isPermissionError && token) {
        console.log("adminDb transaction in payments/reconcile-student failed due to permission; starting REST fallback...");
        if (user.role !== "Admin") {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin." });
        }
        try {
          // Fetch student
          const studentData = await restGetDoc(token, "students", studentId);
          if (!studentData) {
            return res.status(404).json({ error: "Không tìm thấy học viên trong cơ sở dữ liệu." });
          }

          // Fetch and filter payments
          const allPayments = await restListDocs(token, "payments");
          const studentPayments = allPayments.filter(p => p.studentId === studentId && p.status === "Đã duyệt" && p.isCancelled === false);
          
          const paidAmount = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
          const remainingAmount = Math.max(0, Number(studentData.totalFee || 0) - paidAmount);

          const updatedFields = {
            ...studentData,
            paidAmount,
            remainingAmount
          };
          const studentUpdateTime = studentData.__updateTime;
          delete updatedFields.__updateTime;

          // Write audit log
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Đối soát công nợ học viên",
            details: `Thực hiện đối soát lại công nợ học viên ${studentData.name} ID ${studentId} thành công. Số tiền đã nộp hợp lệ: ${paidAmount.toLocaleString('vi-VN')} đ, dư nợ còn lại: ${remainingAmount.toLocaleString('vi-VN')} đ [Giao dịch Server REST].`,
            userId: user.uid,
            userName: user.displayName,
            userRole: user.role
          };

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("students", studentId),
              fields: wrapFirestoreFields(updatedFields)
            },
            currentDocument: {
              updateTime: studentUpdateTime
            }
          });

          writes.push({
            update: {
              name: getFirestoreDocumentName("auditLogs", logId),
              fields: wrapFirestoreFields(freshLog)
            },
            currentDocument: {
              exists: false
            }
          });

          await restCommit(token, writes);
          return res.json({ success: true, paidAmount, remainingAmount });
        } catch (restErr: any) {
          console.error("Giao dịch đối soát công nợ học viên REST thất bại:", restErr);
          return res.status(500).json({ error: restErr.message || "Xảy ra sự cố khi đối soát công nợ (REST)." });
        }
      } else {
        console.error("Giao dịch đối soát công nợ học viên thất bại:", error);
        return res.status(500).json({ error: error.message || "Xảy ra sự cố khi đối soát công nợ học viên." });
      }
    }
  });

  // 5. Handles batch-confirm of scheduling sugerences, transactional check with rigid constraints
  app.post("/api/lessons/batch-confirm", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (user.role !== "Admin" && user.role !== "Staff") {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Chỉ quản trị viên hoặc nhân viên nghiệp vụ mới được gọi." });
    }

    const { lessons, overrideReason } = req.body;
    if (!lessons || !Array.isArray(lessons)) {
      return res.status(400).json({ error: "Định dạng danh sách ca tập gửi lên không hợp lệ." });
    }

    const adminDb = getAdminDb();

    const token = (req as any).userToken;
    try {
      const resultObj = await adminDb.runTransaction(async (transaction) => {
        // Fetch snapshot states in parallel inside transaction
        const lessonsSnap = await transaction.get(adminDb.collection("lessons"));
        const existingLessons: any[] = [];
        lessonsSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status !== "Học viên báo nghỉ" && d.status !== "Giảng viên báo nghỉ" && d.status !== "Hủy lịch") {
            existingLessons.push(d);
          }
        });

        const instSnap = await transaction.get(adminDb.collection("instructors"));
        const instructors: any[] = [];
        instSnap.forEach((docSnap) => instructors.push(docSnap.data()));

        const vehSnap = await transaction.get(adminDb.collection("vehicles"));
        const vehicles: any[] = [];
        vehSnap.forEach((docSnap) => vehicles.push(docSnap.data()));

        const studentsSnap = await transaction.get(adminDb.collection("students"));
        const studentsMap: Record<string, any> = {};
        studentsSnap.forEach((docSnap) => {
          studentsMap[docSnap.id] = docSnap.data();
        });

        const conflicts: { index: number; lesson: any; reasons: string[] }[] = [];
        const validToSave: any[] = [];

        // Scan proposed lessons for schedule overlaps or capability boundaries
        for (let idx = 0; idx < lessons.length; idx++) {
          const newL = lessons[idx];
          const reasons: string[] = [];

          // Validate entity existence
          const studentExist = studentsMap[newL.studentId];
          const teacher = instructors.find((i) => i.id === newL.instructorId);
          const car = vehicles.find((v) => v.id === newL.vehicleId);

          if (!studentExist) {
            throw new Error(`Xếp lịch thất bại: Học viên ID ${newL.studentId} không hợp lệ hoặc không tồn tại.`);
          }
          if (!teacher) {
            throw new Error(`Xếp lịch thất bại: Giảng viên ID ${newL.instructorId} không tồn tại hoặc bị xóa.`);
          }
          if (!car) {
            throw new Error(`Xếp lịch thất bại: Xe tập ID ${newL.vehicleId} không tồn tại hoặc bị xóa.`);
          }

          if (timeToMinutes(newL.endTime) <= timeToMinutes(newL.startTime)) {
            reasons.push("Khung giờ bắt đầu phải kết thúc trước mốc kết thúc.");
          }

          if (teacher) {
            const teachHours = teacher.workingHours || { start: "07:00", end: "18:00" };
            const teachStart = timeToMinutes(teachHours.start);
            const teachEnd = timeToMinutes(teachHours.end);
            const lessonStart = timeToMinutes(newL.startTime);
            const lessonEnd = timeToMinutes(newL.endTime);

            if (lessonStart < teachStart || lessonEnd > teachEnd) {
              reasons.push(`Ngoài giờ hành chính của GV ${teacher.name} (${teachHours.start} - ${teachHours.end}).`);
            }

            if (teacher.daysOff && teacher.daysOff.includes(newL.date)) {
              reasons.push(`Giảng viên ${teacher.name} có ngày nghỉ phép vào ngày ${newL.date}.`);
            }

            const lessonDateObj = new Date(newL.date);
            let dayOfWeek = lessonDateObj.getDay();
            if (dayOfWeek === 0) dayOfWeek = 7;
            if (teacher.workingDays && !teacher.workingDays.includes(dayOfWeek)) {
              reasons.push(`Giảng viên ${teacher.name} không xếp lịch Thứ ${dayOfWeek === 7 ? "Chủ Nhật" : dayOfWeek + 1}.`);
            }
          }

          if (car && car.status !== "Sẵn sàng") {
            reasons.push(`Xe tập ${car.name} (${car.plate}) hiện tại: ${car.status}.`);
          }

          // In-memory duplicate search over stored lessons + proposed lessons processed so far
          const allMemoryLessons = [...existingLessons, ...validToSave];
          for (const les of allMemoryLessons) {
            if (les.id === newL.id) continue;
            if (les.date === newL.date) {
              const overlap = doIntervalsOverlap(newL.startTime, newL.endTime, les.startTime, les.endTime);
              if (overlap) {
                if (les.studentId === newL.studentId) {
                  const sObj = studentsMap[les.studentId];
                  reasons.push(`Học viên ${sObj?.name || ""} có lịch tập chồng chéo trùng giờ (${les.startTime} - ${les.endTime}).`);
                }
                if (les.instructorId === newL.instructorId) {
                  reasons.push(`Giảng viên ${teacher?.name || ""} có lịch giảng dạy trùng giờ (${les.startTime} - ${les.endTime}).`);
                }
                if (les.vehicleId === newL.vehicleId) {
                  reasons.push(`Xe tập (${car?.plate || "Phân công"}) đã bị gán chồng lịch trong khung giờ (${les.startTime} - ${les.endTime}).`);
                }
              }
            }
          }

          if (reasons.length > 0) {
            conflicts.push({ index: idx, lesson: newL, reasons });
          } else {
            validToSave.push(newL);
          }
        }

        // Action gate
        if (conflicts.length > 0) {
          if (user.role !== "Admin") {
            return {
              success: false,
              hasConflicts: true,
              conflicts,
              message: "Phát hiện xung đột lịch biểu chéo. Yêu cầu tài khoản quyền Quản trị tối cao (Admin) để thực hiện áp đặt ghi đè."
            };
          }

          if (!overrideReason) {
            return {
              success: false,
              hasConflicts: true,
              conflicts,
              message: "Phát hiện xung đột lịch biểu chéo. Vui lòng gán lý do cưỡng chế ghi đè để lưu hồ sơ."
            };
          }
        }

        // Commit saving logic
        const finalLessonsToCommit = conflicts.length > 0 ? lessons : validToSave;
        for (const les of finalLessonsToCommit) {
          const finalId = (les.id && !les.id.startsWith("sug_")) 
            ? les.id 
            : `less_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const lessonRef = adminDb.collection("lessons").doc(finalId);
          transaction.set(lessonRef, {
            ...les,
            id: finalId,
            status: "Đã xác nhận",
            attendanceStatus: "Chưa điểm danh",
            resultNote: les.resultNote || ""
          });
        }

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const logRef = adminDb.collection("auditLogs").doc(logId);

        if (conflicts.length > 0 && overrideReason) {
          transaction.set(logRef, {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Ghi đè lịch học hàng loạt",
            details: `Quản trị viên ${user.email} đã áp đặt cưỡng chế ghi đè lịch học hàng loạt cho ${finalLessonsToCommit.length} học viên. Lý do: ${overrideReason}. Chi tiết xung đột: ${JSON.stringify(conflicts.map(c => c.reasons).flat())}`,
            userId: user.uid,
            userName: user.displayName,
            userRole: "Admin"
          });
        } else {
          transaction.set(logRef, {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Xếp lịch học hàng loạt",
            details: `Lưu hàng loạt thành công ${finalLessonsToCommit.length} ca tập tự động vào thời khóa biểu.`,
            userId: user.uid,
            userName: user.displayName,
            userRole: user.role
          });
        }

        return {
          success: true,
          committedCount: finalLessonsToCommit.length,
          hasConflicts: conflicts.length > 0
        };
      });

      return res.json(resultObj);
    } catch (error: any) {
      const isPermissionError = error.message?.includes("permissions") || error.message?.includes("PERMISSION_DENIED") || error.code === 7;
      if (isPermissionError && token) {
        console.log("adminDb transaction in lessons/batch-confirm failed due to permission; starting REST fallback...");
        try {
          // Fetch existing data via REST
          const existingLessonsAll = await restListDocs(token, "lessons");
          const existingLessons = existingLessonsAll.filter((d: any) => d.status !== "Học viên báo nghỉ" && d.status !== "Giảng viên báo nghỉ" && d.status !== "Hủy lịch");
          
          const instructors = await restListDocs(token, "instructors");
          const vehicles = await restListDocs(token, "vehicles");
          const students = await restListDocs(token, "students");
          
          const studentsMap: Record<string, any> = {};
          students.forEach((s) => {
            studentsMap[s.id] = s;
          });

          const conflicts: { index: number; lesson: any; reasons: string[] }[] = [];
          const validToSave: any[] = [];

          // Scan proposed lessons for schedule overlaps or capability boundaries
          for (let idx = 0; idx < lessons.length; idx++) {
            const newL = lessons[idx];
            const reasons: string[] = [];

            // Validate entity existence
            const studentExist = studentsMap[newL.studentId];
            const teacher = instructors.find((i) => i.id === newL.instructorId);
            const car = vehicles.find((v) => v.id === newL.vehicleId);

            if (!studentExist) {
              throw new Error(`Xếp lịch thất bại: Học viên ID ${newL.studentId} không hợp lệ hoặc không tồn tại.`);
            }
            if (!teacher) {
              throw new Error(`Xếp lịch thất bại: Giảng viên ID ${newL.instructorId} không tồn tại hoặc bị xóa.`);
            }
            if (!car) {
              throw new Error(`Xếp lịch thất bại: Xe tập ID ${newL.vehicleId} không tồn tại hoặc bị xóa.`);
            }

            if (timeToMinutes(newL.endTime) <= timeToMinutes(newL.startTime)) {
              reasons.push("Khung giờ bắt đầu phải kết thúc trước mốc kết thúc.");
            }

            if (teacher) {
              const teachHours = teacher.workingHours || { start: "07:00", end: "18:00" };
              const teachStart = timeToMinutes(teachHours.start);
              const teachEnd = timeToMinutes(teachHours.end);
              const lessonStart = timeToMinutes(newL.startTime);
              const lessonEnd = timeToMinutes(newL.endTime);

              if (lessonStart < teachStart || lessonEnd > teachEnd) {
                reasons.push(`Ngoài giờ hành chính của GV ${teacher.name} (${teachHours.start} - ${teachHours.end}).`);
              }

              if (teacher.daysOff && teacher.daysOff.includes(newL.date)) {
                reasons.push(`Giảng viên ${teacher.name} có ngày nghỉ phép vào ngày ${newL.date}.`);
              }

              const lessonDateObj = new Date(newL.date);
              let dayOfWeek = lessonDateObj.getDay();
              if (dayOfWeek === 0) dayOfWeek = 7;
              if (teacher.workingDays && !teacher.workingDays.includes(dayOfWeek)) {
                reasons.push(`Giảng viên ${teacher.name} không xếp lịch Thứ ${dayOfWeek === 7 ? "Chủ Nhật" : dayOfWeek + 1}.`);
              }
            }

            if (car && car.status !== "Sẵn sàng") {
              reasons.push(`Xe tập ${car.name} (${car.plate}) hiện tại: ${car.status}.`);
            }

            // In-memory duplicate search over stored lessons + proposed lessons processed so far
            const allMemoryLessons = [...existingLessons, ...validToSave];
            for (const les of allMemoryLessons) {
              if (les.id === newL.id) continue;
              if (les.date === newL.date) {
                const overlap = doIntervalsOverlap(newL.startTime, newL.endTime, les.startTime, les.endTime);
                if (overlap) {
                  if (les.studentId === newL.studentId) {
                    const sObj = studentsMap[les.studentId];
                    reasons.push(`Học viên ${sObj?.name || ""} có lịch tập chồng chéo trùng giờ (${les.startTime} - ${les.endTime}).`);
                  }
                  if (les.instructorId === newL.instructorId) {
                    reasons.push(`Giảng viên ${teacher?.name || ""} có lịch giảng dạy trùng giờ (${les.startTime} - ${les.endTime}).`);
                  }
                  if (les.vehicleId === newL.vehicleId) {
                    reasons.push(`Xe tập (${car?.plate || "Phân công"}) đã bị gán chồng lịch trong khung giờ (${les.startTime} - ${les.endTime}).`);
                  }
                }
              }
            }

            if (reasons.length > 0) {
              conflicts.push({ index: idx, lesson: newL, reasons });
            } else {
              validToSave.push(newL);
            }
          }

          // Action gate
          if (conflicts.length > 0) {
            if (user.role !== "Admin") {
              return res.json({
                success: false,
                hasConflicts: true,
                conflicts,
                message: "Phát hiện xung đột lịch biểu chéo. Yêu cầu tài khoản quyền Quản trị tối cao (Admin) để thực hiện áp đặt ghi đè."
              });
            }

            if (!overrideReason) {
              return res.json({
                success: false,
                hasConflicts: true,
                conflicts,
                message: "Phát hiện xung đột lịch biểu chéo. Vui lòng gán lý do cưỡng chế ghi đè để lưu hồ sơ."
              });
            }
          }

          // Commit saving logic via REST
          const finalLessonsToCommit = conflicts.length > 0 ? lessons : validToSave;
          for (const les of finalLessonsToCommit) {
            const finalId = (les.id && !les.id.startsWith("sug_")) 
              ? les.id 
              : `less_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            
            const updatedLes = {
              ...les,
              id: finalId,
              status: "Đã xác nhận",
              attendanceStatus: "Chưa điểm danh",
              resultNote: les.resultNote || ""
            };
            await restSetDoc(token, "lessons", finalId, updatedLes);
          }

          // Log transaction
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          let logData: any;
          if (conflicts.length > 0 && overrideReason) {
            logData = {
              id: logId,
              timestamp: new Date().toISOString(),
              action: "Ghi đè lịch học hàng loạt",
              details: `Quản trị viên ${user.email} đã áp đặt cưỡng chế ghi đè lịch học hàng loạt cho ${finalLessonsToCommit.length} học viên. Lý do: ${overrideReason}. Chi tiết xung đột: ${JSON.stringify(conflicts.map(c => c.reasons).flat())}`,
              userId: user.uid,
              userName: user.displayName,
              userRole: "Admin"
            };
          } else {
            logData = {
              id: logId,
              timestamp: new Date().toISOString(),
              action: "Xếp lịch học hàng loạt",
              details: `Lưu hàng loạt thành công ${finalLessonsToCommit.length} ca tập tự động vào thời khóa biểu.`,
              userId: user.uid,
              userName: user.displayName,
              userRole: user.role
            };
          }
          await restSetDoc(token, "auditLogs", logId, logData);

          return res.json({
            success: true,
            committedCount: finalLessonsToCommit.length,
            hasConflicts: conflicts.length > 0
          });
        } catch (restErr: any) {
          console.error("Giao dịch lưu loạt lịch học tập REST thất bại:", restErr);
          return res.status(500).json({ error: restErr.message || "Lỗi khi lưu loạt lịch học (REST)." });
        }
      } else {
        console.error("Giao dịch lưu loạt lịch học tập tự động thất bại:", error);
        return res.status(500).json({ error: error.message || "Lỗi máy chủ khi lưu loạt lịch học." });
      }
    }
  });

  const ocrRateLimits = new Map<string, { count: number; resetTime: number }>();

  // API Endpoint to process OCR on identity cards (CCCD) / profiles
  app.post("/api/ocr-card", checkOcrAuth, async (req, res) => {
    try {
      const user = req.currentUserProfile;
      const now = Date.now();
      const userLimit = ocrRateLimits.get(user.uid);

      if (userLimit) {
        if (now < userLimit.resetTime) {
          if (userLimit.count >= 10) { // max 10 OCR per minute
            return res.status(429).json({ error: "Yêu cầu quá nhanh: Đã vượt tần suất 10 lượt nhận diện định danh CCCD/phút. Vui lòng dừng đợi." });
          }
          userLimit.count++;
        } else {
          ocrRateLimits.set(user.uid, { count: 1, resetTime: now + 60000 });
        }
      } else {
        ocrRateLimits.set(user.uid, { count: 1, resetTime: now + 60000 });
      }

      const { image, cardType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Không tìm thấy ảnh tải lên." });
      }

      // Lazy check endpoint-specific variable
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "Yêu cầu cấu hình khóa API Gemini (GEMINI_API_KEY) trong bảng cài đặt Secrets để sử dụng chức năng AI nhận diện tự động."
        });
      }

      // Parse base64 and mime-type
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      let mimeType = "image/jpeg";
      let base64Data = image;
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      if (mimeType === "image/jpg") {
        mimeType = "image/jpeg";
      }

      // Enforce file formats
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        return res.status(400).json({ error: "Hệ thống chỉ chấp nhận định dạng ảnh JPG, PNG hoặc WEBP." });
      }

      // Enforce file limit of 4 MB
      const binaryLength = base64Data.length * 0.75;
      if (binaryLength >= 4 * 1024 * 1024) {
        return res.status(400).json({ error: "Ảnh tải lên phải nhỏ hơn 4 MB." });
      }

      const ai = getGeminiClient();

      const prompt = `Bạn là một mô hình AI tiện ích giúp phân tích ảnh chụp thẻ hồ sơ người dùng Việt Nam. 
Hãy đọc ảnh và trích xuất ra các thông tin chi tiết: Họ và tên (Full name), Ngày sinh (Date of birth), và Địa chỉ thường trú (Permanent address).
Loại ảnh đang cung cấp: ${cardType || "Ảnh CCCD"}.
Lưu ý quy tắc đặc biệt:
1. Đối với Họ và tên, hãy trích xuất chính xác và viết hoa đầy đủ (Ví dụ: "NGUYỄN VĂN A").
2. Đối với Ngày sinh, hãy chuẩn hóa về định dạng YYYY-MM-DD (Ví dụ: "15/04/1998" hay "15-04-1998" -> "1998-04-15"). Nếu không đọc rõ ngày sinh từ ảnh, bắt buộc trả về chuỗi rỗng. Không được suy đoán hoặc tự tạo dữ liệu.
3. Đối với Địa chỉ, hãy lấy địa chỉ/quê quán hoặc nơi thường trú ghi trên thẻ.
4. Nếu ảnh là "Ảnh thẻ/Ảnh chân dung" không có văn bản hoặc không phải là thẻ định danh, hãy để trống các trường trên hoặc trả về rỗng. Tránh bịa đặt ra thông tin không có trên ảnh.
5. Không được suy đoán bất kỳ thông tin nào không nhìn thấy rõ trên ảnh. Nếu không chắc chắn, trả về chuỗi rỗng.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullName: {
                type: Type.STRING,
                description: "Họ tên học viên được viết in hoa đầy đủ."
              },
              address: {
                type: Type.STRING,
                description: "Nơi thường trú hoặc địa chỉ hiện thị trên thẻ học viên."
              },
              dob: {
                type: Type.STRING,
                description: "Ngày sinh định dạng chuẩn YYYY-MM-DD. Ví dụ: '1998-10-15'."
              }
            },
            required: ["fullName", "address", "dob"]
          }
        }
      });

      const extractedText = response.text || "{}";
      const data = JSON.parse(extractedText.trim());

      return res.json({
        success: true,
        data: data
      });
    } catch (error: any) {
      console.error("Gemini OCR server error: ", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Xảy ra sự cố bất ngờ khi xử lý hình ảnh chụp bằng AI."
      });
    }
  });

  // Vite development middleware vs Static serve
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

startServer();
