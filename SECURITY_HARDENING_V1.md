# Security Hardening v1

Mục tiêu của bản này là siết các điểm rủi ro cao nhưng không chạm vào nghiệp vụ DAT, OCR, lịch học, tài chính transaction hoặc UI danh sách học viên.

## Đã làm

- Khóa UI Demo / Simulation trên production build bằng `import.meta.env.PROD`.
- Chặn quick demo login khi production hoặc khi demo toggle không được phép.
- Không còn để chuỗi demo password đầy đủ dạng plain text trong `Auth.tsx`.
- Nút fallback sang Simulation khi Firebase Auth lỗi chỉ hiển thị trong môi trường dev/demo hợp lệ.
- Mở rộng `scripts/static-security-check.mjs` để kiểm tra:
  - Firestore catch-all deny.
  - Client write lock cho các collection nhạy cảm.
  - REST fallback không bị mở tự do.
  - `/api/payments/cancel` không cho Accountant hủy phiếu.
  - Không hardcode `GEMINI_API_KEY` trong server.
  - Không chứa demo password plain text trong Auth.
  - Có production guard cho Demo/Simulation.
  - Không commit private key/service role/admin password rõ ràng.
  - Cảnh báo hoặc fail khi `VITE_ENABLE_DEMO_MODE=true` ở Production/CI.

## Chưa đụng trong v1

- Chưa sửa DAT.
- Chưa sửa OCR logic.
- Chưa sửa transaction tài chính.
- Chưa sửa nghiệp vụ xếp lịch.
- Chưa thêm `centerId` / multi-tenant isolation cho SaaS.

## Test nhanh sau khi pull branch

```bash
npm install
npm run verify
npm run build
```

## Test thủ công cần làm

- Production build không hiện nút `Simulation (Local)`.
- Production build không hiện danh sách `Đăng nhập nhanh Demo`.
- Khi Firebase Auth lỗi, production không có nút `Bỏ qua và dùng thử Offline Simulation`.
- Local dev vẫn có thể bật demo nếu cần test.
- Admin thật vẫn đăng nhập được bằng Firebase Auth.
- Staff / Accountant / Instructor vẫn đăng nhập đúng quyền thật.

## Bước tiếp theo

Security v2 nên xử lý phần `lhp_user` trong localStorage và thêm auth gate chặt hơn ở `App.tsx` / `DatabaseContext.tsx`. Phần này cần test kỹ để tránh làm lỗi restore session Firebase và chế độ local dev.
