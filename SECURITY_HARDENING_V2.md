# Security Hardening v2

Mục tiêu của v2 là giảm rủi ro UI giả quyền bằng F12/localStorage mà không sửa lan vào DAT, OCR, transaction tài chính, nghiệp vụ xếp lịch hoặc màn danh sách học viên.

## Đã làm

- Thêm auth bootstrap guard trong `src/main.tsx` chạy trước khi render React app.
- Nếu không phải môi trường dev/demo hợp lệ:
  - Ép `lhp_use_local_simulation=false`.
  - Xóa `lhp_user` khỏi localStorage trước khi `DatabaseProvider` đọc state ban đầu.
- Nếu đang ở Cloud/Firebase mode:
  - Xóa `lhp_user` khỏi localStorage trước khi app render.
- Local Simulation chỉ được giữ `lhp_user` khi:
  - Không phải production build.
  - Đang ở dev hoặc `VITE_ENABLE_DEMO_MODE=true`.
  - Người dùng thật sự bật `lhp_use_local_simulation=true`.
- Mở rộng `scripts/static-security-check.mjs` để CI kiểm tra guard này.

## Tác dụng bảo mật

Trước v2, nếu `lhp_user` trong localStorage bị sửa tay thành Admin, `DatabaseContext` có thể đọc giá trị đó khi khởi tạo UI.

Sau v2, ở production/cloud mode, cache này bị xóa trước khi React render nên UI không dùng được role giả từ localStorage để mở màn quản trị.

## Không đụng trong v2

- DAT.
- OCR logic nhận diện.
- Transaction tài chính.
- Nghiệp vụ xếp lịch.
- Refactor lớn `DatabaseContext.tsx`.
- Multi-tenant `centerId` / SaaS isolation.

## Test nhanh

```bash
npm run verify
npm run build
```

## Test thủ công

- Trên production/cloud mode, sửa localStorage `lhp_user.role = Admin`, reload lại trang → app không được vào bằng role giả.
- Trên production/cloud mode, set `lhp_use_local_simulation=true`, reload → app tự ép về `false`.
- Trên local dev có demo mode, Simulation vẫn dùng được để test.
- Đăng nhập Firebase thật vẫn restore bằng Firebase Auth, không phụ thuộc `lhp_user`.

## Việc để dành cho Security v3

- Refactor `DatabaseContext.tsx` để bỏ hẳn việc ghi profile Firebase vào `lhp_user`.
- Tách local simulation user cache sang key riêng như `lhp_local_demo_user`.
- Thêm auth gate rõ trong `App.tsx` nếu Firebase Auth chưa `authReady`.
