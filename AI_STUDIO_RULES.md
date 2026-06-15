# Google AI Studio Safety Rules

File này là quy tắc bắt buộc khi dùng Google AI Studio sửa app Lịch Học Pro.

## Quy tắc bắt buộc

1. Tuyệt đối không sửa, xóa, ghi đè hoặc động vào thư mục `.github/workflows`.
2. Tuyệt đối không sửa, xóa, ghi đè các file CI/CD, deploy, GitHub Actions.
3. Tuyệt đối không xóa hoặc thay đổi workflow Deploy Cloud Run.
4. Chỉ sửa đúng các file được yêu cầu trong prompt.
5. Không refactor lan man, không đổi kiến trúc, không đổi tên biến/hàm nếu không cần.
6. Không tự ý xóa file cấu hình production.
7. Không tự ý đổi Firebase project, Cloud Run service, service account, region hoặc secret name.
8. Sau khi sửa phải báo rõ:
   - Đã sửa file nào
   - Lý do sửa
   - Logic trước/sau
   - Kết quả kiểm tra
9. Sau khi sửa phải chạy kiểm tra:

```bash
npm run lint
npm run build
npm run verify
```

10. Không báo hoàn thành nếu build lỗi.

## File không được động vào nếu prompt không yêu cầu rõ

- `.github/workflows/**`
- `firebase.json`
- `.firebaserc`
- `firestore.rules`
- `storage.rules`
- Các file chứa secret/key/service account
- Các file deploy Cloud Run
- Các workflow GitHub Actions

## File thường được phép sửa khi làm app

- `src/components/**`
- `src/context/**`
- `src/services/**`
- `src/types.ts`
- `server.ts`
- `package.json` chỉ khi thật sự cần và phải giải thích rõ

## Quy tắc cho module xếp lịch học

1. Dữ liệu học viên, giảng viên, xe phải lấy từ Firestore/Cloud thật.
2. Không được giả định dữ liệu local nếu app đang chạy trên Cloud Run.
3. Không dùng `workingDays` để chặn xếp lịch nếu UI giảng viên không có trường quản lý lịch làm việc theo thứ.
4. Giảng viên `Đang hoạt động`, `Đang dạy`, `Hoạt động`, `Active` được phép xếp lịch.
5. Chỉ chặn giảng viên nếu:
   - Không tìm thấy giảng viên
   - Giảng viên tạm nghỉ/ngừng dạy/nghỉ việc/không hoạt động
   - Giảng viên không có hạng dạy phù hợp
   - Giảng viên trùng ca thật theo `lessons`
   - Giảng viên có ngày nghỉ cụ thể trong `daysOff` nếu dữ liệu này tồn tại
6. Xe `Đang hoạt động` nghĩa là xe vận hành bình thường, không có nghĩa là xe đang đi dạy.
7. Xe bận ca chỉ được xác định bằng `lessons` theo `vehicleId + date + startTime/endTime`.
8. Không dùng popup `alert()` trong luồng lưu lịch. Phải hiển thị lỗi/thành công trong UI.
9. Bấm nút lưu lịch phải có phản hồi ngay:
   - Đang lưu
   - Lỗi rõ
   - Thành công rõ

## Mẫu đầu prompt bắt buộc khi giao việc cho AI Studio

```text
QUY TẮC BẮT BUỘC TRƯỚC KHI SỬA CODE:

1. Đọc file AI_STUDIO_RULES.md trước khi sửa.
2. Tuyệt đối không sửa, xóa, ghi đè hoặc động vào thư mục `.github/workflows`.
3. Tuyệt đối không sửa, xóa, ghi đè các file CI/CD, deploy, GitHub Actions.
4. Tuyệt đối không xóa hoặc thay đổi workflow Deploy Cloud Run.
5. Chỉ sửa đúng các file được yêu cầu trong prompt.
6. Không refactor lan man, không đổi kiến trúc, không đổi tên biến/hàm nếu không cần.
7. Sau khi sửa phải báo rõ đã sửa file nào, lý do sửa, và chạy kiểm tra:
   - npm run lint
   - npm run build
   - npm run verify
8. Không báo hoàn thành nếu build lỗi.
```
