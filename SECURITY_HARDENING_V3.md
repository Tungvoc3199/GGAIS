# Security Hardening v3

Mục tiêu của v3 là giảm tiếp rủi ro giả quyền bằng F12/localStorage bằng cách tách cache người dùng demo khỏi cache legacy `lhp_user`.

## Đã làm

- Thêm `src/security/authStorageGuard.ts`.
- `src/main.tsx` gọi `installAuthStorageGuard()` trước khi render React app.
- Cloud/Firebase mode:
  - `localStorage.getItem('lhp_user')` trả về `null`.
  - `localStorage.setItem('lhp_user', ...)` bị bỏ qua và tự xóa legacy cache.
  - Không còn persist Firebase profile vào cache role frontend không tin cậy.
- Local Simulation/dev mode:
  - Demo user được lưu ở `lhp_local_demo_user`.
  - `lhp_user` chỉ còn là compatibility bridge cho code cũ khi đang ở local simulation hợp lệ.
- Production build:
  - Không cho bật `lhp_use_local_simulation=true` bằng DevTools.
  - Tự ép `lhp_use_local_simulation=false`.
- Mở rộng `scripts/static-security-check.mjs` để kiểm tra:
  - `main.tsx` phải cài auth guard trước `createRoot`.
  - tồn tại `authStorageGuard.ts`.
  - guard phải có `lhp_local_demo_user`, `guardedGetItem`, `guardedSetItem`, `canUseLocalSimulation`.

## Tác dụng bảo mật

Trước v3, Firebase profile vẫn có thể được ghi vào `lhp_user` trong localStorage sau đăng nhập. Sau v3, mọi thao tác đọc/ghi `lhp_user` ở cloud/production mode bị guard chặn trước khi React app chạy.

## Không đụng trong v3

- DAT.
- OCR logic nhận diện.
- Transaction tài chính.
- Nghiệp vụ xếp lịch.
- Danh sách học viên.
- Refactor lớn `DatabaseContext.tsx`.
- Multi-tenant `centerId` / SaaS isolation.

## Test nhanh

```bash
npm run verify
npm run build
```

## Test thủ công

- Production/cloud mode: sửa `lhp_user.role = Admin`, reload → `localStorage.getItem('lhp_user')` trả về `null` và không vào được app.
- Production/cloud mode: set `lhp_use_local_simulation=true`, reload → tự ép về `false`.
- Sau Firebase login thật, profile không persist vào `lhp_user`.
- Local dev/demo mode: Simulation vẫn đăng nhập được và cache demo nằm ở `lhp_local_demo_user`.

## Ghi chú

Phần auth restore gate riêng trong `App.tsx` nên làm ở v4 bằng patch nhỏ nếu cần, vì lần này ưu tiên khóa cache role trước render và tránh sửa lan file App lớn.
