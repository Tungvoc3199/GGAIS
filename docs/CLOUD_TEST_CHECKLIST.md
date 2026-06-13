# ĐỒNG BỘ KIỂM THỬ CLOUD - LỊCH HỌC PRO

Tài liệu hướng dẫn kiểm tra an ninh, lỗi phân quyền và vận hành dữ liệu thực tế trên môi trường phân tán Cloud.

## 1. KHỞI TẠO BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES)

Trước khi kích hoạt hoặc deploy, hãy đảm bảo các biến sau được cấu hình đầy đủ trong `.env` trên máy chủ hoặc Cloud Env settings:

```env
# Cấu hình Cổng Môi trường
PORT=3000
NODE_ENV=production

# Firebase Admin SDK (Chạy trên môi trường Server bảo mật)
FIREBASE_PROJECT_ID=lich-hoc-pro-XXXX
# Cho phép tự động định vị credentials trong runtime của Google Cloud (Cloud Run / GAE)

# Cấu hình an toàn ghi REST Fallback (Chế độ phát triển)
ALLOW_DEV_REST_FALLBACK=false
```

---

## 2. KỊCH BẢN KIỂM THỬ BẢO MẬT (SECURITY SMOKE CHECKS)

### Kiểm thử 1: Truy cập ẩn danh không kèm Authentication Token
* **Hành động**: Gọi trực tiếp REST API `/api/students/create` không đính kèm header `Authorization`.
* **Kỳ vọng**: Server chặn ngay lập tức và trả về mã phản hồi `401 Unauthorized` hoặc `403 Forbidden`. Không được tạo bản ghi giả mạo trong Database.

### Kiểm thử 2: Bypass quyền hạn bằng tài khoản Học Viên / Giảng Viên
* **Hành động**: Đăng nhập bằng tài khoản Giảng viên (`Instructor`), lấy JWT Token gán vào header `Authorization: Bearer <token>`, sau đó gọi API xóa học viên `/api/students/delete`.
* **Kỳ vọng**: Hệ thống từ chối thực thi với mã trả về `403 Forbidden`. Chỉ tài khoản có vai trò `Admin` mới được thực hiện hành động hủy hồ sơ cốt lõi.

### Kiểm thử 3: Chặn ghi đè dữ liệu trực tiếp qua REST Fallback
* **Hành động**: Phát request ghi dữ liệu trực tiếp thông qua cổng REST Fallback mà không có khóa bí mật đúng.
* **Kỳ vọng**: Server từ chối xử lý, bảo vệ tính bất biến của dữ liệu.

---

## 3. CHECKLIST KIỂM TRA ĐỒNG BỘ DỮ LIỆU THẬT

- [ ] **Mã hóa CCCD & VNeID**: Xác thực rằng tài sản CCCD và VNeID được tải lên với `cccdStoragePath` và `eidStoragePath` riêng tư. Không phát sinh URL công khai có thể tải về tự do.
- [ ] **Làm sạch tài tệp mồ côi**: Chạy thử nghiệm thêm học viên với tệp ảnh CCCD lỗi để kích hoạt rollback. Xác minh tệp ảnh vừa tải lên được dọn sạch hoàn toàn khỏi bucket.
- [ ] **OCR Chẩn đoán lỗi**: Kiểm thử quét OCR chỉ chạy thành công khi có tài khoản `Admin` hoặc `Staff`, từ chối từ xa đối với vai trò `Instructor` hoặc `Guest`.
