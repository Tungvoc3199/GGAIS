# Security Hardening v4

Mục tiêu của v4 là chuẩn hóa lớp bảo mật triển khai Firebase production: App Check, biến môi trường, checklist cấu hình Console và kiểm tra CI.

## Đã làm trong code

- Thêm Firebase App Check tùy chọn trong `src/services/firebase.ts`.
- App Check chỉ khởi tạo khi có `VITE_FIREBASE_APP_CHECK_SITE_KEY`.
- App Check debug token chỉ cho local dev, không dùng production.
- Cập nhật `.env.example` với:
  - `VITE_FIREBASE_APP_CHECK_SITE_KEY`
  - `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN`
  - `VITE_PRODUCTION_SECURITY_CHECK`
- Mở rộng `scripts/static-security-check.mjs` để kiểm tra:
  - `firebase.ts` có App Check setup.
  - `.env.example` có biến App Check.
  - `VITE_ENABLE_DEMO_MODE=true` sẽ fail khi production/CI security check bật.
  - `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN` sẽ fail khi production/CI security check bật.

## Không đụng trong v4

- DAT.
- OCR logic nhận diện.
- Transaction tài chính.
- Nghiệp vụ xếp lịch.
- Danh sách học viên.
- Role/permission server logic.
- Multi-tenant `centerId` / SaaS isolation.

## Cấu hình Firebase Console bắt buộc trước production

### 1. Authorized domains

Firebase Console → Authentication → Settings → Authorized domains.

Chỉ giữ domain thật dùng production, ví dụ:

```txt
lichhocpro.vn
www.lichhocpro.vn
```

Localhost chỉ nên để trong project dev.

### 2. API key restrictions

Google Cloud Console → APIs & Services → Credentials → Firebase Web API Key.

Cấu hình HTTP referrers cho production domain. Không dùng chung key dev/prod nếu có thể.

### 3. App Check

Firebase Console → App Check → Web app.

- Đăng ký reCAPTCHA v3 hoặc reCAPTCHA Enterprise.
- Lấy site key đưa vào hosting env:

```bash
VITE_FIREBASE_APP_CHECK_SITE_KEY=site_key_that_cannot_be_secret_but_must_match_domain
```

- Test trước ở monitor mode.
- Sau khi ổn mới enforce Firestore/Storage.

### 4. Tách project dev/prod

Khuyến nghị:

```txt
ggais-dev
ggais-prod
```

Không dùng chung database production cho demo/dev.

### 5. Deploy rules

```bash
firebase deploy --only firestore:rules,storage
```

## Test nhanh

```bash
npm run verify
npm run build
```

## Test thủ công

- Production không có `VITE_ENABLE_DEMO_MODE=true`.
- Production không set `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN`.
- Có `VITE_FIREBASE_APP_CHECK_SITE_KEY` thật trên hosting.
- Firebase App Check monitor không báo lỗi bất thường trước khi enforce.
- Firestore/Storage vẫn đọc/ghi đúng sau khi App Check chạy.

## Việc để dành cho Security v5

- Tách `firebase-applet-config.json` thành cấu hình dev/prod rõ ràng.
- Thêm tenant/center isolation bằng `centerId` cho SaaS.
- Backend rate limit cho các API nhạy cảm.
