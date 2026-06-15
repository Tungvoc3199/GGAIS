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
    storageBucket: firebaseConfig.storageBucket,
  });
}

function getAdminDb() {
  const dbId = firebaseConfig.firestoreDatabaseId;
  const app = admin.apps[0] || admin.app();
  return dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}


async function lookupFirebaseAccountByIdToken(idToken: string) {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey) {
    throw new Error("Thiếu Firebase Web API Key.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
  const timeoutId = setTimeout(() => controller.abort(), 35000);

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timeoutId);
  }
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
  const normCategory = (category || "").trim().normalize("NFC");
  for (const [key, value] of Object.entries(INSTALLMENT_KEY_BY_CATEGORY)) {
    if (key.trim().normalize("NFC") === normCategory) {
      return `${studentId}_${value}`;
    }
  }
  return null;
}

async function restSetDoc(token: string, collection: string, docId: string, data: any): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const allowDevRest = process.env.ALLOW_DEV_REST_FALLBACK === "true";

  if (isProd || !allowDevRest) {
    throw new Error("SERVER_FIREBASE_ADMIN_NOT_CONFIGURED");
  }

  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
  
  const keys = Object.keys(data);
  const queryParams = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${queryParams}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

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

function checkRestWriteFallbackAllowed(res: any): boolean {
  const isProd = process.env.NODE_ENV === "production";
  const allowDevRest = process.env.ALLOW_DEV_REST_FALLBACK === "true";

  if (isProd || !allowDevRest) {
    res.status(500).json({
      error: "SERVER_FIREBASE_ADMIN_NOT_CONFIGURED"
    });
    return false;
  }

  return true;
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
      const timeoutId = setTimeout(() => controller.abort(), 35000);

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
  const PORT = Number(process.env.PORT) || 3000;

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
          if (!checkRestWriteFallbackAllowed(res)) return;
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

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      environment: process.env.NODE_ENV || "development",
      firebaseAdminInitialized: admin.apps.length > 0,
      geminiConfigured: !!process.env.GEMINI_API_KEY
    });
  });

  app.get("/api/debug/duplicate-payments", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (user.role !== "Admin") {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Chỉ Admin mới được phép truy cập." });
    }

    try {
      const adminDb = getAdminDb();
      const paymentsSnapshot = await adminDb.collection("payments").get();
      
      const paymentsMap: Record<string, any[]> = {};
      const duplicates: any[] = [];

      paymentsSnapshot.forEach(doc => {
        const id = doc.id;
        const data = doc.data();
        if (!data.isCancelled && data.status === "Đã duyệt") {
          const studentId = data.studentId;
          const category = (data.category || "").trim().normalize("NFC");
          const key = `${studentId}_${category}`;
          if (!paymentsMap[key]) {
            paymentsMap[key] = [];
          }
          paymentsMap[key].push({ id, ...data });
        }
      });

      for (const [key, list] of Object.entries(paymentsMap)) {
        if (list.length > 1) {
          const parts = key.split("_");
          const stId = parts[0];
          const catName = parts.slice(1).join("_");
          duplicates.push({
            studentId: stId,
            category: catName,
            count: list.length,
            payments: list.map(p => ({
              id: p.id,
              amount: p.amount,
              receiver: p.receiver,
              createdAt: p.createdAt
            }))
          });
        }
      }

      return res.json({
        success: true,
        duplicatesCount: duplicates.length,
        duplicates
      });
    } catch (error: any) {
      console.error("[Debug Duplicates] Error finding duplicate payments:", error);
      return res.status(500).json({ error: error.message || "Lỗi máy chủ khi quét biên lai trùng." });
    }
  });

  app.get("/api/students/:studentId/document-url", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Giáo vụ tuyển sinh mới được phép xem tài liệu định danh học viên." });
    }
    const { studentId } = req.params;
    const { kind } = req.query;
    if (kind !== "cccd" && kind !== "eid") {
      return res.status(400).json({ error: "Tham số kind phải là 'cccd' hoặc 'eid'." });
    }
    try {
      const adminDb = getAdminDb();
      const studentDoc = await adminDb.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Không tìm thấy hồ sơ học viên." });
      }
      const studentData = studentDoc.data() || {};
      const storagePath = kind === "cccd" ? studentData.cccdStoragePath : studentData.eidStoragePath;
      if (!storagePath) {
        // Fallback for legacy database records
        const legacyImageUrl = kind === "cccd" ? studentData.cccdImage : studentData.eidImage;
        if (legacyImageUrl) {
          console.warn(`[Legacy fallback] Using public image url for student ${studentId}`);
          return res.json({ url: legacyImageUrl });
        }
        return res.status(404).json({ error: "Chưa cấu hình đường dẫn tài liệu định danh này cho học viên." });
      }
      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 5 * 60 * 1000 // 5 minutes
      });
      return res.json({ url: signedUrl });
    } catch (err: any) {
      console.error("Lỗi lấy signed URL:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi tạo signed URL." });
    }
  });

  app.post("/api/students/create", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Giáo vụ mới được phép thêm học viên." });
    }
    const studentData = req.body;
    let studentId = studentData.id;
    if (!studentId || !/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
      studentId = `stud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    const totalFee = Number(studentData.totalFee || 0);
    const totalSessions = Number(studentData.totalSessions || 0);
    if (!studentData.name || !studentData.phone) {
      return res.status(400).json({ error: "Tên học viên và số điện thoại không được bỏ trống." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const yy = new Date().getFullYear().toString().slice(-2);
      let studentCode = "";

      const newStudent = await adminDb.runTransaction(async (transaction) => {
        const counterRef = adminDb.collection("settings").doc("studentCounter");
        const counterDoc = await transaction.get(counterRef);
        let nextNum = 1;
        if (counterDoc.exists) {
          nextNum = counterDoc.data()?.nextCodeNo || 1;
        }
        studentCode = `HV-${yy}-${String(nextNum).padStart(4, '0')}`;
        transaction.set(counterRef, { nextCodeNo: nextNum + 1 }, { merge: true });

        const freshStudent = {
          ...studentData,
          id: studentId,
          code: studentCode,
          paidAmount: 0,
          remainingAmount: totalFee,
          completedSessions: 0,
          remainingSessions: totalSessions,
          registrationDate: studentData.registrationDate || new Date().toISOString().split("T")[0],
          status: studentData.status || "Mới đăng ký",
          // Avoid malicious override fields from client
          theoryCompleted: !!studentData.theoryCompleted,
          simulationCompleted: !!studentData.simulationCompleted,
          isArchived: false
        };

        transaction.set(adminDb.collection("students").doc(studentId), freshStudent);

        const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        transaction.set(adminDb.collection("auditLogs").doc(logId), {
          id: logId,
          timestamp: new Date().toISOString(),
          action: "Thêm học viên học lái",
          details: `Thành viên ${user.displayName || user.email} đã thêm học viên mới: ${freshStudent.name} (${studentCode}).`,
          userId: user.uid,
          userName: user.displayName || user.email || "Staff",
          userRole: user.role
        });

        return freshStudent;
      });

      return res.json({ success: true, student: newStudent });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Students Create] adminDb failed; starting REST fallback...");
        try {
          let nextNum = 1;
          const counterDoc = await restGetDoc(token, "settings", "studentCounter");
          if (counterDoc) {
            nextNum = Number(counterDoc.nextCodeNo || 1);
          }
          const yy = new Date().getFullYear().toString().slice(-2);
          const studentCode = `HV-${yy}-${String(nextNum).padStart(4, '0')}`;

          const freshStudent = {
            id: studentId,
            code: studentCode,
            name: studentData.name || "",
            phone: studentData.phone || "",
            dob: studentData.dob || "",
            address: studentData.address || "",
            licenseClass: studentData.licenseClass || "B số sàn",
            courseType: studentData.courseType || "Tiêu chuẩn",
            registrationDate: studentData.registrationDate || new Date().toISOString().split("T")[0],
            totalFee: totalFee,
            paidAmount: 0,
            remainingAmount: totalFee,
            nextPaymentDeadline: studentData.nextPaymentDeadline || "",
            status: studentData.status || "Mới đăng ký",
            totalSessions: totalSessions,
            completedSessions: 0,
            remainingSessions: totalSessions,
            assignedInstructorId: studentData.assignedInstructorId || "",
            assignedVehicleId: studentData.assignedVehicleId || "",
            notes: studentData.notes || "",
            reminderStatus: studentData.reminderStatus || "Chưa gửi nhắc nhở",
            tags: studentData.tags || [],
            theoryCompleted: !!studentData.theoryCompleted,
            simulationCompleted: !!studentData.simulationCompleted,
            isArchived: false
          };

          const writes: any[] = [];
          if (counterDoc) {
            const counterUpdateTime = counterDoc.__updateTime;
            const updatedCounter = { ...counterDoc, nextCodeNo: nextNum + 1 };
            delete updatedCounter.__updateTime;
            writes.push({
              update: {
                name: getFirestoreDocumentName("settings", "studentCounter"),
                fields: wrapFirestoreFields(updatedCounter)
              },
              currentDocument: {
                updateTime: counterUpdateTime
              }
            });
          } else {
            writes.push({
              update: {
                name: getFirestoreDocumentName("settings", "studentCounter"),
                fields: wrapFirestoreFields({ nextCodeNo: 2 })
              },
              currentDocument: {
                exists: false
              }
            });
          }

          writes.push({
            update: {
              name: getFirestoreDocumentName("students", studentId),
              fields: wrapFirestoreFields(freshStudent)
            },
            currentDocument: {
              exists: false
            }
          });

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Thêm học viên học lái",
            details: `Thành viên ${user.displayName || user.email} đã thêm học viên mới: ${freshStudent.name} (${studentCode}) [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          return res.json({ success: true, student: freshStudent });
        } catch (restErr: any) {
          console.error("[Students Create REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể tạo học viên bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi thêm học viên:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi gán học viên mới." });
    }
  });

  app.post("/api/students/update-documents", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối." });
    }
    const { studentId, avatarImage, cccdStoragePath, eidStoragePath } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "Thiếu mã học viên studentId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const studentRef = adminDb.collection("students").doc(studentId);
      const studentDoc = await studentRef.get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Không tìm thấy học viên." });
      }
      const updates: any = {};
      if (avatarImage !== undefined) updates.avatarImage = avatarImage;
      if (cccdStoragePath !== undefined) updates.cccdStoragePath = cccdStoragePath;
      if (eidStoragePath !== undefined) updates.eidStoragePath = eidStoragePath;

      await studentRef.update(updates);

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Cập nhật hồ sơ giấy tờ",
        details: `Thành viên ${user.displayName || user.email} đã cập nhật hồ sơ giấy tờ hoặc ảnh cho học viên ${studentDoc.data()?.name || studentId}.`,
        userId: user.uid,
        userName: user.displayName || user.email || "Staff",
        userRole: user.role
      });

      return res.json({ success: true, updates });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Students Update Doc] adminDb update failed; starting REST fallback...");
        try {
          const oldData = await restGetDoc(token, "students", studentId);
          if (!oldData) {
            return res.status(404).json({ error: "Không tìm thấy học viên." });
          }
          const updates: any = {};
          if (avatarImage !== undefined) updates.avatarImage = avatarImage;
          if (cccdStoragePath !== undefined) updates.cccdStoragePath = cccdStoragePath;
          if (eidStoragePath !== undefined) updates.eidStoragePath = eidStoragePath;

          const mergedStudent = {
            ...oldData,
            ...updates
          };
          const studentUpdateTime = oldData.__updateTime;
          delete mergedStudent.__updateTime;

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("students", studentId),
              fields: wrapFirestoreFields(mergedStudent)
            },
            currentDocument: {
              updateTime: studentUpdateTime
            }
          });

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Cập nhật hồ sơ giấy tờ",
            details: `Thành viên ${user.displayName || user.email} đã cập nhật hồ sơ giấy tờ hoặc ảnh cho học viên ${oldData.name || studentId} [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          return res.json({ success: true, updates });
        } catch (restErr: any) {
          console.error("[Students Update Doc REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể cập nhật ảnh hồ sơ bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi cập nhật ảnh hồ sơ:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi cập nhật ảnh hồ sơ." });
    }
  });

  app.post("/api/students/update", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Giáo vụ mới được sửa thông tin học viên." });
    }
    const { studentId, ...updatedData } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "Thiếu studentId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const studentRef = adminDb.collection("students").doc(studentId);
      const studentDoc = await studentRef.get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Không tìm thấy học viên." });
      }
      
      const allowedUpdates: any = { ...updatedData };
      delete allowedUpdates.id;
      delete allowedUpdates.code;
      delete allowedUpdates.paidAmount;
      delete allowedUpdates.remainingAmount;
      delete allowedUpdates.completedSessions;
      delete allowedUpdates.remainingSessions;
      delete allowedUpdates.archivedAt;
      delete allowedUpdates.archivedBy;
      delete allowedUpdates.isArchived;

      // Handle totalFee change gracefully - recalculate remainingAmount
      const oldData = studentDoc.data() || {};
      if (allowedUpdates.totalFee !== undefined) {
        const newFee = Number(allowedUpdates.totalFee);
        const paid = Number(oldData.paidAmount || 0);
        allowedUpdates.remainingAmount = Math.max(0, newFee - paid);
      }
      if (allowedUpdates.totalSessions !== undefined) {
        const totalS = Number(allowedUpdates.totalSessions);
        const completed = Number(oldData.completedSessions || 0);
        allowedUpdates.remainingSessions = Math.max(0, totalS - completed);
      }

      await studentRef.update(allowedUpdates);

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Sửa thông tin học viên",
        details: `Thành viên ${user.displayName || user.email} đã sửa hồ sơ của học viên ${oldData.name} (${oldData.code}).`,
        userId: user.uid,
        userName: user.displayName || user.email || "Staff",
        userRole: user.role
      });

      return res.json({ success: true, updates: allowedUpdates });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Students Update] adminDb update failed; starting REST fallback...");
        try {
          const oldData = await restGetDoc(token, "students", studentId);
          if (!oldData) {
            return res.status(404).json({ error: "Không tìm thấy học viên." });
          }

          const allowedUpdates: any = { ...updatedData };
          delete allowedUpdates.id;
          delete allowedUpdates.code;
          delete allowedUpdates.paidAmount;
          delete allowedUpdates.remainingAmount;
          delete allowedUpdates.completedSessions;
          delete allowedUpdates.remainingSessions;
          delete allowedUpdates.archivedAt;
          delete allowedUpdates.archivedBy;
          delete allowedUpdates.isArchived;

          if (allowedUpdates.totalFee !== undefined) {
            const newFee = Number(allowedUpdates.totalFee);
            const paid = Number(oldData.paidAmount || 0);
            allowedUpdates.remainingAmount = Math.max(0, newFee - paid);
          }
          if (allowedUpdates.totalSessions !== undefined) {
            const totalS = Number(allowedUpdates.totalSessions);
            const completed = Number(oldData.completedSessions || 0);
            allowedUpdates.remainingSessions = Math.max(0, totalS - completed);
          }

          const mergedStudent = {
            ...oldData,
            ...allowedUpdates
          };
          const studentUpdateTime = oldData.__updateTime;
          delete mergedStudent.__updateTime;

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("students", studentId),
              fields: wrapFirestoreFields(mergedStudent)
            },
            currentDocument: {
              updateTime: studentUpdateTime
            }
          });

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Sửa thông tin học viên",
            details: `Thành viên ${user.displayName || user.email} đã sửa hồ sơ của học viên ${oldData.name} (${oldData.code}) [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          return res.json({ success: true, updates: allowedUpdates });
        } catch (restErr: any) {
          console.error("[Students Update REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể lưu hồ sơ bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi sửa thông tin học viên:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi lưu hồ sơ." });
    }
  });

  app.post("/api/students/archive", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (user.role !== "Admin") {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Chỉ quản trị viên mới được phép lưu trữ (archive) học viên." });
    }
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "Thiếu mã học viên studentId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const studentRef = adminDb.collection("students").doc(studentId);
      const studentDoc = await studentRef.get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Không tìm thấy học viên." });
      }
      const oldData = studentDoc.data() || {};
      const updates = {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: user.displayName || user.email || "Admin",
        status: "Tạm dừng" as const
      };
      await studentRef.update(updates);

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Lưu trữ học viên",
        details: `Quản trị viên ${user.displayName || user.email} đã chuyển trạng thái lưu trữ cho học viên ${oldData.name} (${oldData.code}).`,
        userId: user.uid,
        userName: user.displayName || user.email || "Admin",
        userRole: user.role
      });

      return res.json({ success: true });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Students Archive] adminDb update failed; starting REST fallback...");
        try {
          const oldData = await restGetDoc(token, "students", studentId);
          if (!oldData) {
            return res.status(404).json({ error: "Không tìm thấy học viên." });
          }
          const updates = {
            isArchived: true,
            archivedAt: new Date().toISOString(),
            archivedBy: user.displayName || user.email || "Admin",
            status: "Tạm dừng" as const
          };

          const mergedStudent = {
            ...oldData,
            ...updates
          };
          const studentUpdateTime = oldData.__updateTime;
          delete mergedStudent.__updateTime;

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("students", studentId),
              fields: wrapFirestoreFields(mergedStudent)
            },
            currentDocument: {
              updateTime: studentUpdateTime
            }
          });

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Lưu trữ học viên",
            details: `Quản trị viên ${user.displayName || user.email} đã chuyển trạng thái lưu trữ cho học viên ${oldData.name} (${oldData.code}) [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Admin",
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
          console.error("[Students Archive REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể lưu trữ học viên bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi lưu trữ học viên:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi lưu trữ học viên." });
    }
  });

  app.post("/api/students/delete", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (user.role !== "Admin") {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối: Chỉ Admin mới được quyền xóa vĩnh viễn học viên." });
    }
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "Thiếu mã học viên studentId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const studentRef = adminDb.collection("students").doc(studentId);
      const studentDoc = await studentRef.get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Không tìm thấy học viên." });
      }
      const oldData = studentDoc.data() || {};

      // Check lessons and payments
      const lessonsSnap = await adminDb.collection("lessons").where("studentId", "==", studentId).limit(1).get();
      const paymentsSnap = await adminDb.collection("payments").where("studentId", "==", studentId).limit(1).get();
      if (!lessonsSnap.empty || !paymentsSnap.empty) {
        return res.status(400).json({ error: "Không thể xóa học viên do đã tồn tại dữ liệu hóa đơn học phí hoặc buổi học sắp xếp." });
      }

      await studentRef.delete();

      // Best effort clean files from storage
      try {
        const bucket = admin.storage().bucket();
        if (oldData.cccdStoragePath) {
          await bucket.file(oldData.cccdStoragePath).delete().catch(() => {});
        }
        if (oldData.eidStoragePath) {
          await bucket.file(oldData.eidStoragePath).delete().catch(() => {});
        }
      } catch (stErr) {
        console.warn("Best effort storage cleanup failed:", stErr);
      }

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Xóa học viên",
        details: `Quản trị viên ${user.displayName || user.email} đã xóa vĩnh viễn học viên ${oldData.name} và mọi tệp tin kèm theo khỏi hệ thống.`,
        userId: user.uid,
        userName: user.displayName || user.email || "Admin",
        userRole: "Admin"
      });

      return res.json({ success: true });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Students Delete] adminDb delete failed; starting REST fallback...");
        try {
          const oldData = await restGetDoc(token, "students", studentId);
          if (!oldData) {
            return res.status(404).json({ error: "Không tìm thấy học viên." });
          }

          const writes: any[] = [];
          writes.push({
            delete: getFirestoreDocumentName("students", studentId),
            currentDocument: {
              exists: true
            }
          });

          try {
            const bucket = admin.storage().bucket();
            if (oldData.cccdStoragePath) {
              await bucket.file(oldData.cccdStoragePath).delete().catch(() => {});
            }
            if (oldData.eidStoragePath) {
              await bucket.file(oldData.eidStoragePath).delete().catch(() => {});
            }
          } catch (stErr) {
            console.warn("Best effort storage cleanup failed:", stErr);
          }

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Xóa học viên",
            details: `Quản trị viên ${user.displayName || user.email} đã xóa vĩnh viễn học viên ${oldData.name} và mọi tệp tin kèm theo khỏi hệ thống [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Admin",
            userRole: "Admin"
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
          console.error("[Students Delete REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể xóa học viên bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi xóa học viên:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi xóa học viên." });
    }
  });

const ACTIVE_VEHICLE_OPERATION_STATUSES = new Set([
  "",
  "Sẵn sàng",
  "Đang hoạt động",
  "Hoạt động",
  "Hoạt động bình thường",
  "Sẵn sàng vận hành",
  "Available",
  "Active"
]);

const INACTIVE_VEHICLE_STATUS_KEYWORDS = [
  "bảo dưỡng",
  "sửa",
  "hỏng",
  "ngừng",
  "không hoạt động",
  "khóa",
  "đã bán"
];

function isVehicleOperational(status: any): boolean {
  const value = String(status || "").trim();
  const lower = value.toLowerCase();

  if (INACTIVE_VEHICLE_STATUS_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return false;
  }

  return ACTIVE_VEHICLE_OPERATION_STATUSES.has(value) || !value;
}

  app.post("/api/lessons/create", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền xếp lịch học chỉ dành cho Admin hoặc Staff giáo vụ." });
    }
    const lesson = req.body;
    const { override, overrideReason } = req.query; // Admin override if true
    if (!lesson.studentId || !lesson.instructorId || !lesson.vehicleId || !lesson.date || !lesson.startTime || !lesson.endTime) {
      return res.status(400).json({ error: "Thông tin buổi học khuyết thiếu các trường bắt buộc." });
    }
    try {
      const adminDb = getAdminDb();
      const studentSnap = await adminDb.collection("students").doc(lesson.studentId).get();
      const instructorSnap = await adminDb.collection("instructors").doc(lesson.instructorId).get();
      const vehicleSnap = await adminDb.collection("vehicles").doc(lesson.vehicleId).get();

      if (!studentSnap.exists) return res.status(400).json({ error: "Học viên liên kết lịch học không khả dụng." });
      if (!instructorSnap.exists) return res.status(400).json({ error: "Giáo viên hướng dẫn liên kết không tồn tại." });
      if (!vehicleSnap.exists) return res.status(400).json({ error: "Xe liên kết không tồn tại hoặc đã bị xóa." });

      const student = studentSnap.data() || {};
      const instructor = instructorSnap.data() || {};
      const vehicle = vehicleSnap.data() || {};

      // Time validity
      if (lesson.startTime >= lesson.endTime) {
        return res.status(400).json({ error: "Thời gian bắt đầu xếp lịch phải trước giờ kết thúc." });
      }

      // 1. Check vehicle availability
      if (!isVehicleOperational(vehicle.status) && override !== "true") {
        return res.status(400).json({
          error: `Xe tập lái ${vehicle.name || ""} (${vehicle.plate || ""}) chưa đủ điều kiện vận hành để xếp lịch. Trạng thái hiện tại: ${vehicle.status || "Chưa khai báo"}.`
        });
      }

      // 2. Instructor working Day
      const dateObj = new Date(lesson.date);
      const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday,... 6 = Saturday
      const workingDays: number[] = instructor.workingDays || [];
      if (!workingDays.includes(dayOfWeek) && override !== "true") {
        return res.status(400).json({ error: `Giáo viên ${instructor.name} không đăng ký lịch dạy vào Thứ có mã số ${dayOfWeek}.` });
      }

      // 3. Instructor daysOff
      const daysOff: string[] = instructor.daysOff || [];
      if (daysOff.includes(lesson.date) && override !== "true") {
        return res.status(400).json({ error: `Giáo viên ${instructor.name} xin nghỉ phép vào ngày ${lesson.date} này.` });
      }

      // 4. Time range fit
      const workStart = instructor.workingHours?.start || "07:30";
      const workEnd = instructor.workingHours?.end || "17:30";
      if ((lesson.startTime < workStart || lesson.endTime > workEnd) && override !== "true") {
        return res.status(400).json({ error: `Lịch học (${lesson.startTime} - ${lesson.endTime}) nằm ngoài khung giờ làm việc của giáo viên (${workStart} - ${workEnd}).` });
      }

      // 5. Overlap scan
      const activeStatusList = ["Chờ xác nhận", "Đã xác nhận", "Đã hoàn thành"];
      const conflicts: string[] = [];

      // Check overlapping of Instructor
      const instructorLessons = await adminDb.collection("lessons")
        .where("instructorId", "==", lesson.instructorId)
        .where("date", "==", lesson.date)
        .get();
      
      for (const dDoc of instructorLessons.docs) {
        const l = dDoc.data();
        if (activeStatusList.includes(l.status)) {
          if (lesson.startTime < l.endTime && lesson.endTime > l.startTime) {
            conflicts.push(`Lịch của giáo viên bị trùng với lịch giảng dạy mã ${l.id} (${l.startTime} - ${l.endTime})`);
          }
        }
      }

      // Check overlapping of Vehicle
      const vehicleLessons = await adminDb.collection("lessons")
        .where("vehicleId", "==", lesson.vehicleId)
        .where("date", "==", lesson.date)
        .get();

      for (const dDoc of vehicleLessons.docs) {
        const l = dDoc.data();
        if (activeStatusList.includes(l.status)) {
          if (lesson.startTime < l.endTime && lesson.endTime > l.startTime) {
            conflicts.push(`Lịch của xe bị trùng với lịch của học viên khác mã ${l.id} (${l.startTime} - ${l.endTime})`);
          }
        }
      }

      // Check overlapping of Student
      const studentLessons = await adminDb.collection("lessons")
        .where("studentId", "==", lesson.studentId)
        .where("date", "==", lesson.date)
        .get();

      for (const dDoc of studentLessons.docs) {
        const l = dDoc.data();
        if (activeStatusList.includes(l.status)) {
          if (lesson.startTime < l.endTime && lesson.endTime > l.startTime) {
            conflicts.push(`Lịch của học viên bị trùng lịch tự xếp mã ${l.id} (${l.startTime} - ${l.endTime})`);
          }
        }
      }

      if (conflicts.length > 0) {
        if (override === "true" && user.role === "Admin") {
          if (!overrideReason) {
            return res.status(400).json({ error: "Yêu cầu cung cấp lý do Admin ép đè thời gian (overrideReason)." });
          }
          console.log(`Admin overrode calendar conflict: ${overrideReason}`);
        } else {
          return res.status(409).json({ error: "Lịch học chồng chéo mốc thời gian đã đăng ký.", conflicts });
        }
      }

      // Create lesson
      const lessonId = lesson.id || `les_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const freshLesson = {
        ...lesson,
        id: lessonId,
        status: lesson.status || "Chờ xác nhận",
        attendanceStatus: lesson.attendanceStatus || "Chưa điểm danh",
        resultNote: lesson.resultNote || ""
      };

      await adminDb.collection("lessons").doc(lessonId).set(freshLesson);

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Xếp lịch học",
        details: `Đăng ký thành công ca học mới cho học viên ${student.name} mã lịch ${lessonId} (${lesson.date} ${lesson.startTime} - ${lesson.endTime})${override === "true" ? " [Ghi đè bởi Admin: " + overrideReason + "]" : ""}.`,
        userId: user.uid,
        userName: user.displayName || user.email || "Staff",
        userRole: user.role
      });

      return res.json({ success: true, lesson: freshLesson });

    } catch (err: any) {
      const token = (req as any).userToken;
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Lessons Create Project] adminDb failed; starting REST fallback...");
        try {
          const studentDoc = await restGetDoc(token, "students", lesson.studentId);
          const studentName = studentDoc?.name || "Học viên";
          const lessonId = lesson.id || `les_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLesson = {
            ...lesson,
            id: lessonId,
            status: lesson.status || "Chờ xác nhận",
            attendanceStatus: lesson.attendanceStatus || "Chưa điểm danh",
            resultNote: lesson.resultNote || ""
          };

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("lessons", lessonId),
              fields: wrapFirestoreFields(freshLesson)
            },
            currentDocument: {
              exists: false
            }
          });

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Xếp lịch học",
            details: `Đăng ký thành công ca học mới cho học viên ${studentName} mã lịch ${lessonId} (${lesson.date} ${lesson.startTime} - ${lesson.endTime})${override === "true" ? " [Ghi đè bởi Admin: " + overrideReason + "]" : ""} [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          return res.json({ success: true, lesson: freshLesson });
        } catch (restErr: any) {
          console.error("[Lessons Create REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể xếp lịch bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi xếp lịch:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi xếp lịch học." });
    }
  });

  app.post("/api/lessons/update", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền sửa lịch học chỉ dành cho Admin hoặc Staff giáo vụ." });
    }
    const { id: lessonId, ...updates } = req.body;
    if (!lessonId) {
      return res.status(400).json({ error: "Thiếu lessonId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const lessonRef = adminDb.collection("lessons").doc(lessonId);
      const lessonSnap = await lessonRef.get();
      if (!lessonSnap.exists) {
        return res.status(404).json({ error: "Không tìm thấy buổi học lịch liên kết." });
      }
      const oldLesson = lessonSnap.data() || {};
      const studentId = oldLesson.studentId;

      await adminDb.runTransaction(async (transaction) => {
        transaction.update(lessonRef, updates);

        // Track completedSessions updates if status changes
        if (updates.status !== undefined && updates.status !== oldLesson.status) {
          const wasCompleted = oldLesson.status === "Đã hoàn thành";
          const isCompleted = updates.status === "Đã hoàn thành";
          if (wasCompleted !== isCompleted) {
            const studentRef = adminDb.collection("students").doc(studentId);
            const studentDoc = await transaction.get(studentRef);
            if (studentDoc.exists) {
              const sData = studentDoc.data() || {};
              const diff = isCompleted ? 1 : -1;
              const newCompleted = Math.max(0, (sData.completedSessions || 0) + diff);
              const newRemaining = Math.max(0, (sData.totalSessions || 0) - newCompleted);
              transaction.update(studentRef, {
                completedSessions: newCompleted,
                remainingSessions: newRemaining
              });
            }
          }
        }
      });

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Cập nhật lịch học",
        details: `Cập nhật thành công trạng thái ca lịch ID ${lessonId} của học viên ID ${studentId} thành '${updates.status || oldLesson.status}'.`,
        userId: user.uid,
        userName: user.displayName || user.email || "Staff",
        userRole: user.role
      });

      return res.json({ success: true });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Lessons Update] adminDb update failed; starting REST fallback...");
        try {
          const oldLesson = await restGetDoc(token, "lessons", lessonId);
          if (!oldLesson) {
            return res.status(404).json({ error: "Không tìm thấy buổi học lịch liên kết." });
          }
          const studentId = oldLesson.studentId;

          const mergedLesson = {
            ...oldLesson,
            ...updates
          };
          const lessonUpdateTime = oldLesson.__updateTime;
          delete mergedLesson.__updateTime;

          const writes: any[] = [];
          writes.push({
            update: {
              name: getFirestoreDocumentName("lessons", lessonId),
              fields: wrapFirestoreFields(mergedLesson)
            },
            currentDocument: {
              updateTime: lessonUpdateTime
            }
          });

          // Check if status changed and update student sessions
          if (updates.status !== undefined && updates.status !== oldLesson.status) {
            const wasCompleted = oldLesson.status === "Đã hoàn thành";
            const isCompleted = updates.status === "Đã hoàn thành";
            if (wasCompleted !== isCompleted && studentId) {
              const studentDoc = await restGetDoc(token, "students", studentId);
              if (studentDoc) {
                const sData = studentDoc;
                const diff = isCompleted ? 1 : -1;
                const newCompleted = Math.max(0, (sData.completedSessions || 0) + diff);
                const newRemaining = Math.max(0, (sData.totalSessions || 0) - newCompleted);
                
                const studentUpdateTime = studentDoc.__updateTime;
                const updatedStudent = {
                  ...studentDoc,
                  completedSessions: newCompleted,
                  remainingSessions: newRemaining
                };
                delete updatedStudent.__updateTime;

                writes.push({
                  update: {
                    name: getFirestoreDocumentName("students", studentId),
                    fields: wrapFirestoreFields(updatedStudent)
                  },
                  currentDocument: {
                    updateTime: studentUpdateTime
                  }
                });
              }
            }
          }

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Cập nhật lịch học",
            details: `Cập nhật thành công trạng thái ca lịch ID ${lessonId} của học viên ID ${studentId} thành '${updates.status || oldLesson.status}' [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          console.error("[Lessons Update REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể cập nhật lịch học bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi cập nhật buổi học:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi cập nhật buổi học." });
    }
  });

  app.post("/api/lessons/delete", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    if (!["Admin", "Staff"].includes(user.role)) {
      return res.status(403).json({ error: "Quyền xóa lịch học chỉ dành cho Admin hoặc Staff giáo vụ." });
    }
    const { lessonId } = req.body;
    if (!lessonId) {
      return res.status(400).json({ error: "Thiếu lessonId." });
    }
    const token = (req as any).userToken;
    try {
      const adminDb = getAdminDb();
      const lessonRef = adminDb.collection("lessons").doc(lessonId);
      const lessonSnap = await lessonRef.get();
      if (!lessonSnap.exists) {
        return res.status(404).json({ error: "Không tìm thấy buổi học cần xóa." });
      }
      const lessonData = lessonSnap.data() || {};
      const studentId = lessonData.studentId;

      await adminDb.runTransaction(async (transaction) => {
        transaction.delete(lessonRef);
        
        if (lessonData.status === "Đã hoàn thành") {
          const studentRef = adminDb.collection("students").doc(studentId);
          const studentDoc = await transaction.get(studentRef);
          if (studentDoc.exists) {
            const sData = studentDoc.data() || {};
            const newCompleted = Math.max(0, (sData.completedSessions || 0) - 1);
            const newRemaining = Math.max(0, (sData.totalSessions || 0) - newCompleted);
            transaction.update(studentRef, {
              completedSessions: newCompleted,
              remainingSessions: newRemaining
            });
          }
        }
      });

      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await adminDb.collection("auditLogs").doc(logId).set({
        id: logId,
        timestamp: new Date().toISOString(),
        action: "Xóa ca học",
        details: `Cán bộ ${user.displayName || user.email} đã xóa ca học mã lịch ${lessonId} của học viên ID ${studentId}.`,
        userId: user.uid,
        userName: user.displayName || user.email || "Staff",
        userRole: user.role
      });

      return res.json({ success: true });
    } catch (err: any) {
      const isPermissionError = err.message?.includes("permissions") || err.message?.includes("PERMISSION_DENIED") || err.code === 7;
      if (isPermissionError && token) {
        console.log("[Lessons Delete] adminDb delete failed; starting REST fallback...");
        try {
          const lessonData = await restGetDoc(token, "lessons", lessonId);
          if (!lessonData) {
            return res.status(404).json({ error: "Không tìm thấy buổi học cần xóa." });
          }
          const studentId = lessonData.studentId;

          const writes: any[] = [];
          writes.push({
            delete: getFirestoreDocumentName("lessons", lessonId),
            currentDocument: {
              exists: true
            }
          });

          if (lessonData.status === "Đã hoàn thành" && studentId) {
            const studentDoc = await restGetDoc(token, "students", studentId);
            if (studentDoc) {
              const sData = studentDoc;
              const newCompleted = Math.max(0, (sData.completedSessions || 0) - 1);
              const newRemaining = Math.max(0, (sData.totalSessions || 0) - newCompleted);
              
              const studentUpdateTime = studentDoc.__updateTime;
              const updatedStudent = {
                ...studentDoc,
                completedSessions: newCompleted,
                remainingSessions: newRemaining
              };
              delete updatedStudent.__updateTime;

              writes.push({
                update: {
                  name: getFirestoreDocumentName("students", studentId),
                  fields: wrapFirestoreFields(updatedStudent)
                },
                currentDocument: {
                  updateTime: studentUpdateTime
                }
              });
            }
          }

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const freshLog = {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Xóa ca học",
            details: `Cán bộ ${user.displayName || user.email} đã xóa ca học mã lịch ${lessonId} của học viên ID ${studentId} [Server REST].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
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
          console.error("[Lessons Delete REST] Fallback failed:", restErr);
          return res.status(500).json({ error: restErr.message || "Không thể xóa ca học bằng phương thức dự phòng REST." });
        }
      }
      console.error("Lỗi xóa ca học:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi xóa ca học." });
    }
  });

  app.post("/api/audit-logs/create", checkAuth, async (req, res) => {
    const user = req.currentUserProfile;
    const { action, details } = req.body;
    if (!action || !details) {
      return res.status(400).json({ error: "Thiếu action hoặc chi tiết logs." });
    }
    try {
      const adminDb = getAdminDb();
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const logData = {
        id: logId,
        timestamp: new Date().toISOString(),
        action,
        details,
        userId: user.uid,
        userName: user.displayName || user.email || "User",
        userRole: user.role
      };
      await adminDb.collection("auditLogs").doc(logId).set(logData);
      return res.json({ success: true, log: logData });
    } catch (err: any) {
      console.error("Lỗi khởi tạo audit log:", err);
      return res.status(500).json({ error: err.message || "Lỗi máy chủ khi ghi nhật ký." });
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
    const normCategory = (category || "").trim().normalize("NFC");
    const shouldApproveImmediately = !isStaff && (user.role === "Admin" || user.role === "Accountant" || (normCategory !== "Thanh toán bổ sung".normalize("NFC") && normCategory !== "Khác".normalize("NFC")));
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
        if (!checkRestWriteFallbackAllowed(res)) return;
        console.log("adminDb transaction in payments/create failed due to permission; starting REST fallback...");
        if (!["Admin", "Staff", "Accountant"].includes(user.role)) {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản được cấp quyền (Admin, Accountant, Staff)." });
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
        if (!checkRestWriteFallbackAllowed(res)) return;
        console.log("adminDb transaction in payments/approve failed due to permission; starting REST fallback...");
        if (!["Admin", "Accountant"].includes(user.role)) {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin hoặc Kế toán." });
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
    console.log("[Payments Cancel] Incoming request body:", JSON.stringify(req.body));
    console.log("[Payments Cancel] Caller user:", user?.uid, user?.role, user?.email);

    if (user.role !== "Admin") {
      return res.status(403).json({
        error: "Quyền truy cập bị từ chối: Chỉ Admin mới được phép hủy chứng từ doanh thu."
      });
    }

    const { paymentId, reason } = req.body;
    if (!paymentId || !reason) {
      return res.status(400).json({ error: "Bắt buộc cung cấp mã paymentId và lý do hủy." });
    }

    const adminDb = getAdminDb();
    const PAYMENT_CANCEL_TIMEOUT_MS = 25000;

    try {
      console.log("[Payments Cancel] Starting secure transaction for paymentId:", paymentId);
      const result = await withTimeout(
        adminDb.runTransaction(async (transaction) => {
          const paymentRef = adminDb.collection("payments").doc(paymentId);
          const paymentDoc = await transaction.get(paymentRef);
          if (!paymentDoc.exists) {
            throw new Error("NOT_FOUND");
          }
          const paymentData = paymentDoc.data()!;

          if (paymentData.isCancelled) {
            return { duplicated: true };
          }

          if (!paymentData.studentId) {
            throw new Error("PAYMENT_MISSING_STUDENT_ID");
          }

          const studentRef = adminDb.collection("students").doc(paymentData.studentId);
          const studentDoc = await transaction.get(studentRef);
          if (!studentDoc.exists) {
            throw new Error("STUDENT_NOT_FOUND");
          }
          const studentData = studentDoc.data()!;

          // Update payment document
          transaction.update(paymentRef, {
            isCancelled: true,
            cancellationReason: reason.trim(),
            cancelledAt: new Date().toISOString(),
            cancelledBy: user.uid
          });

          let paidAmount = Number(studentData.paidAmount || 0);
          let remainingAmount = Number(studentData.remainingAmount || 0);

          // Safely reverse student ledger if already approved prior
          if (paymentData.status === "Đã duyệt") {
            paidAmount = Math.max(0, paidAmount - Number(paymentData.amount || 0));
            remainingAmount = Math.max(0, Number(studentData.totalFee || 0) - paidAmount);
            transaction.update(studentRef, {
              paidAmount,
              remainingAmount
            });
          }

          // Delete installment lock if category is Đợt 1, 2, 3
          const lockId = getInstallmentLockId(paymentData.studentId, paymentData.category);
          if (lockId) {
            const lockRef = adminDb.collection("paymentInstallmentLocks").doc(lockId);
            transaction.delete(lockRef);
          }

          // Write exactly one audit log
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const logRef = adminDb.collection("auditLogs").doc(logId);
          transaction.set(logRef, {
            id: logId,
            timestamp: new Date().toISOString(),
            action: "Hủy Biên Lai Doanh Thu",
            details: `Yêu cầu hủy biên lai học phí ID ${paymentId} thành công. Chênh hoàn: -${Number(paymentData.amount).toLocaleString('vi-VN')} đ. Lý do: ${reason.trim()} [Giao dịch Server].`,
            userId: user.uid,
            userName: user.displayName || user.email || "Staff",
            userRole: user.role
          });

          return {
            success: true,
            paymentId,
            studentId: paymentData.studentId,
            paidAmount,
            remainingAmount
          };
        }),
        PAYMENT_CANCEL_TIMEOUT_MS,
        "PAYMENT_CANCEL_TIMEOUT"
      );

      if (result.duplicated) {
        console.log("[Payments Cancel] Idempotent response: Payment already cancelled.");
        return res.json({
          success: true,
          duplicated: true,
          message: "Phiếu đã được hủy trước đó."
        });
      }

      console.log("[Payments Cancel] Transaction committed successfully:", result);
      return res.json(result);

    } catch (error: any) {
      console.error("[Payments Cancel] Secure transaction failed:", error);
      console.error("[Payments Cancel] FULL ERROR STACK:", error?.stack || error);
      if (error?.message === "NOT_FOUND") {
        return res.status(404).json({ error: "Không tìm thấy chứng từ cần hủy trong hệ thống." });
      }
      if (error?.message === "STUDENT_NOT_FOUND") {
        return res.status(404).json({ error: "Học viên sở hữu biên lai không tồn tại." });
      }
      if (error?.message === "PAYMENT_MISSING_STUDENT_ID") {
        return res.status(400).json({ error: "Chứng từ thiếu thông tin ID học viên." });
      }
      if (error?.message?.includes("PAYMENT_CANCEL_TIMEOUT")) {
        return res.status(504).json({
          code: "PAYMENT_CANCEL_TIMEOUT",
          error: "Máy chủ xử lý hủy phiếu quá thời gian. Vui lòng kiểm tra lại trạng thái chứng từ trước khi thử lại."
        });
      }
      return res.status(500).json({
        code: "PAYMENT_CANCEL_FAILED",
        error: error.message || "Lỗi máy chủ khi xử lý hủy chứng từ học phí."
      });
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
        if (!checkRestWriteFallbackAllowed(res)) return;
        console.log("adminDb transaction in payments/reconcile-student failed due to permission; starting REST fallback...");
        if (!["Admin", "Accountant"].includes(user.role)) {
          return res.status(403).json({ error: "Chức năng cứu hộ ngoại tuyến bằng REST API chỉ cho phép tài khoản Admin hoặc Kế toán." });
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
        if (!checkRestWriteFallbackAllowed(res)) return;
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
  app.post("/api/ocr-card", checkAuth, async (req, res) => {
    try {
      const user = req.currentUserProfile;
      if (!user || !["Admin", "Staff"].includes(user.role)) {
        return res.status(403).json({ error: "Chức năng nhận diện OCR chỉ cho phép tài khoản Admin hoặc Nhân viên." });
      }
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
