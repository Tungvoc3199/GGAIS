# AI_WORKING_RULES.md — Quy tắc làm việc cho dự án LỊCH HỌC PRO

> File này là luật vận hành bắt buộc trước khi Daisy / AI / Codex / Claude / người sửa code đụng vào dự án.
>
> Mục tiêu: giữ app ổn định, không sửa lan, không phá phần đang chạy ngon, deploy phải xanh rồi mới chuyển việc.

---

## 0. Luật vàng

**PHẦN NÀO ĐANG CHẠY ỔN THÌ KHÔNG ĐƯỢC ĐỘNG VÀO, TRỪ KHI LỖI ĐANG TEST NẰM TRỰC TIẾP Ở PHẦN ĐÓ.**

Không được sửa kiểu “tiện tay chỉnh luôn”, “refactor cho đẹp”, “vá đại cho nhanh”, hoặc “thêm script patch dây chuyền” khi chưa có checkpoint rõ ràng.

Mỗi thay đổi phải trả lời được 5 câu:

1. Lỗi nằm ở đâu?
2. File nào cần sửa?
3. Sửa đúng block nào?
4. Có thể ảnh hưởng module đang ổn nào?
5. Rollback bằng cách nào nếu lỗi?

---

## 1. Bối cảnh dự án

- Tên app: **LỊCH HỌC PRO**
- Repo: `Tungvoc3199/GGAIS`
- Mục tiêu: app quản lý trung tâm đào tạo lái xe, dùng thật, không phải demo.
- Production: Cloud Run + Firestore.
- Người dùng chính: admin/trung tâm/giáo viên.
- Ngôn ngữ UI: tiếng Việt.
- Định dạng Việt Nam là mặc định.

---

## 2. Nguyên tắc định dạng Việt Nam

Toàn bộ app dùng chuẩn Việt Nam:

- Ngày: `dd/mm/yyyy`
- Giờ: `24h`, ví dụ `08:00`, `13:30`, `17:45`
- Không dùng `SA/CH` trong UI.
- Tiền: phân tách hàng nghìn, ví dụ `10.000.000 đ` hoặc input hiển thị dễ đọc.
- Tên học viên: ưu tiên sắp xếp theo **tên gọi cuối** kiểu Việt Nam, không lấy họ làm chuẩn.

Ví dụ sort đúng:

```text
VŨ TÙNG DƯƠNG
ĐỖ THỊ NHUNG
ĐÀM ĐỨC PHƯỚC
```

---

## 3. Các phần đang ổn — KHÓA, không động vào nếu không liên quan trực tiếp

Những module/luồng dưới đây đã được test ổn ở nhiều thời điểm. Không được chỉnh lan:

### 3.1. DAT thực tế

- DAT tính theo bản ghi DAT thật, không tính theo số buổi học.
- BTĐ: `710km / tối thiểu 12h / tối thiểu 2h15 giờ đêm`
- BSS: `810km / tối thiểu 20h / có tối thiểu 4h DAT B tự động / 2h15 giờ đêm DAT BSS`
- C1: `825km / tối thiểu 24h / có tối thiểu 4h DAT BTĐ / 2h15 giờ đêm DAT C1`
- Có cơ chế đối soát DAT riêng.
- Có logic hủy bản ghi DAT sai nhưng không xóa cứng.
- Nhập DAT nên theo công tơ mét đầu/cuối.

Không được quay lại logic kiểu `710 / số buổi`.

### 3.2. OCR / nhận diện hồ sơ học viên

- Ưu tiên đọc VNeID vì có địa chỉ mới sau sáp nhập.
- Nếu đọc đủ VNeID thì không cần cố lấy địa chỉ từ CCCD cũ.
- Ngày sinh phải đưa vào form theo `dd/mm/yyyy`.
- OCR lỗi phải fallback cho nhập tay, không được làm vỡ form.

### 3.3. Thông báo premium

- Không dùng alert native xấu nếu đã có hệ thống thông báo premium.
- Thông báo cần đẹp, rõ trạng thái: success/warning/error/info.
- Trên desktop: Enter có thể xác nhận nút “Đã hiểu”.
- Trên điện thoại: vẫn giữ thao tác bấm tay để tránh bấm nhầm.

### 3.4. Học phí mặc định

- Khi thêm học viên mới, học phí phải lấy từ Cài đặt/Bảng giá mặc định.
- Không hard-code số tiền trong form thêm học viên.
- Hiển thị tiền phải dễ đọc, không để dính kiểu `10000000`.

### 3.5. Xếp lịch thủ công

- Xếp lịch thủ công đang là luồng quan trọng, không được phá.
- Form ngày phải có chọn lịch, nhưng vẫn hiển thị `dd/mm/yyyy`.
- Form giờ phải là 24h, không SA/CH.
- Manual booking chỉ chặn trùng lịch thật; không tự áp các ràng buộc quá cứng của gợi ý tự động.

### 3.6. Danh sách học viên

- Danh sách học viên nên sort ABC theo tên gọi cuối kiểu Việt Nam.
- Không sort theo họ.
- Không làm mất filter, tag, trạng thái, công nợ.

---

## 4. Quy tắc sửa code bắt buộc

### 4.1. Trước khi sửa

Phải tạo checkpoint bằng text trong chat hoặc issue/commit note:

```text
Mục tiêu sửa:
File dự kiến sửa:
Block dự kiến sửa:
Phần tuyệt đối không động:
Rủi ro:
Cách test:
Cách rollback:
```

### 4.2. Khi sửa

- Sửa ít nhất có thể.
- Ưu tiên sửa trực tiếp source chính, không vá vòng.
- Không refactor toàn file nếu chỉ sửa 1 lỗi nhỏ.
- Không đổi tên biến/hàm/component khi không cần.
- Không đổi UI/logic ngoài phạm vi lỗi.
- Không chỉnh đồng thời nhiều module nếu chưa có yêu cầu rõ.

### 4.3. Sau khi sửa

Phải báo rõ:

```text
Đã sửa file nào:
Đã sửa logic gì:
Không động vào phần nào:
Cách test trên app:
Commit SHA:
Trạng thái CI/deploy:
```

Chưa kiểm tra CI/deploy thì không được nói “xong hẳn”.

---

## 5. Quy tắc CI / Deploy

- Deploy xanh là điều kiện bắt buộc trước khi chuyển sang task mới.
- Nếu CI đỏ, ưu tiên sửa CI trước.
- Không tiếp tục build feature mới khi deploy đang đỏ.
- Lỗi mới nhất trong log luôn là nguồn sự thật.
- Không đoán mò khi chưa xem log.

Thứ tự xử lý CI:

1. Đọc lỗi cuối cùng trong log.
2. Xác định script/file gây lỗi.
3. Sửa đúng script/file đó.
4. Commit.
5. Đợi CI/deploy chạy lại.
6. Nếu tiếp tục đỏ, lặp lại với log mới nhất.

---

## 6. Quy tắc patch-script / prebuild

### 6.1. Nguyên tắc mới

**Không được thêm patch-script mới để vá UI/logic app trong prebuild nếu không thật sự cần thiết.**

Lý do: patch-script kiểu tìm/replace source dễ làm hỏng dự án khi source thay đổi, gây CI đỏ dây chuyền.

### 6.2. Khi nào được dùng patch-script

Chỉ dùng khi:

- Không thể sửa trực tiếp source bằng công cụ hiện tại.
- Patch nhỏ, có marker rõ ràng.
- Idempotent: chạy nhiều lần không phá.
- Không tìm thấy block thì không được phá app nếu đó là patch không bắt buộc.
- Có ghi chú rollback.

### 6.3. Khi nào không được dùng patch-script

Không dùng cho:

- UI tab/button/form bình thường.
- Sắp xếp danh sách.
- Sửa text/label.
- Thay đổi nhỏ trong component.
- Thay đổi đang có rủi ro đụng module ổn.

Các phần này phải sửa trực tiếp vào source chính.

---

## 7. Quy tắc khóa module đang ổn

Khi một module đã được user xác nhận “ngon”, phải coi là locked.

Muốn sửa module locked phải có một trong các lý do:

1. User báo lỗi trực tiếp trong module đó.
2. CI/build báo lỗi trực tiếp file đó.
3. Module đó phụ thuộc bắt buộc vào thay đổi đang làm.

Nếu không thuộc 3 lý do trên: không động.

---

## 8. Quy tắc xếp lịch thông minh

Tên module đúng:

```text
Gợi ý xếp lịch thông minh
```

Không gọi là “xếp lịch tự động” theo nghĩa tự ghi lịch thật.

Luồng đúng:

```text
Học viên rảnh trước
→ app gợi ý ca
→ admin/anh duyệt
→ mới ghi lịch thật
```

Ưu tiên xếp theo:

1. Lịch rảnh của học viên.
2. Hạn thi / cần học gấp.
3. Số buổi còn lại.
4. Tránh học viên bị bỏ lâu quá.
5. Lịch rảnh của thầy.
6. Xe phù hợp.
7. Không trùng giờ / không quá sát ca.
8. Địa điểm đón gần nhau nếu có thể.

Nếu học viên nhập khung giờ riêng, phải ưu tiên khung giờ riêng đó.
Nếu học viên không nhập khung giờ riêng, mới dùng khung giờ mặc định của thầy/xe.

Ngày thi trung tâm:

- Ngày thi phải được note đỏ/màu nổi bật.
- Ngày thi thường để tự xếp tay vì còn đưa học viên đi thi.
- Gợi ý thông minh cần biết lịch thi để ưu tiên học ôn/chip trước ngày thi.

---

## 9. Quy tắc xe tập lái

Trạng thái xe “Đang hoạt động” nghĩa là xe hoạt động bình thường, không phải xe đang đi dạy.

Không được hiểu sai:

```text
Đang hoạt động ≠ đang sử dụng trong một ca học cụ thể
```

Xe hợp lệ để xếp lịch gồm các trạng thái theo chuẩn hệ thống hiện tại như:

- Đang hoạt động
- Sẵn sàng

Tùy dữ liệu cũ, logic phải tương thích và không khóa nhầm xe.

Hạng xe:

- B tự động: ưu tiên xe tự động.
- B số sàn: có thể học xe số sàn và vẫn có phần học xe tự động theo quy định DAT/chương trình.
- C1: vẫn có thể có yêu cầu học DAT BTĐ.

Không được báo lỗi cứng kiểu “B số sàn không được học xe tự động” nếu thực tế nghiệp vụ cho phép.

---

## 10. Quy tắc giảng viên

Không được mặc định giảng viên phải có field `active=true` nếu dữ liệu thật đang dùng field khác như `status`.

Logic lọc giảng viên phải tương thích dữ liệu thật:

- Nếu có `active`, dùng active.
- Nếu không có `active`, dựa vào `status` hợp lệ.
- Không để mất tên giảng viên vì filter cứng sai field.

---

## 11. Quy tắc xác nhận đã học

Cần có thao tác nhanh:

1. Nút **Xong** ở từng dòng lịch học.
2. Nút **Xác nhận đã học** trong form cập nhật lịch.

Logic đúng:

```text
Đổi trạng thái buổi học → Đã hoàn thành
Đổi điểm danh → Có mặt
Backend cập nhật tiến độ học viên +1 buổi nếu phù hợp
Thông báo premium hoàn tất
```

Nếu ca đã hoàn thành rồi thì không được cộng trùng.

---

## 12. Quy tắc nhắc học viên bán tự động

Module đúng:

```text
Module nhắc học viên bán tự động
→ tạo mẫu tin
→ mở Zalo/copy nội dung
→ ghi log đã nhắc
→ lọc học viên cần nhắc
```

Không tự gửi tin nếu chưa có tích hợp chính thức/được phép.

Luồng an toàn:

1. Lọc học viên cần nhắc.
2. Tạo nội dung mẫu.
3. Copy/mở Zalo.
4. User gửi thủ công.
5. App ghi log “đã nhắc”.

---

## 13. Quy tắc UI/UX

- App phải có cảm giác premium, sạch, rõ, không phèn.
- Tránh alert native nếu có modal/toast premium.
- Mobile-first: phải test trên iPhone Safari/Chrome mobile.
- Desktop vẫn phải dùng nhanh bằng bàn phím ở những chỗ phù hợp.
- Không để select/time/date native hiện `SA/CH`.
- Những nút hành động lặp lại phải giảm bước.

---

## 14. Quy tắc rollback

Mỗi commit sửa lỗi phải có cách rollback:

- Rollback commit nếu lỗi toàn bộ.
- Hoặc revert đúng file nếu lỗi nhỏ.
- Không vá tiếp chồng vá khi chưa hiểu lỗi gốc.

Nếu deploy đỏ liên tục:

1. Dừng feature mới.
2. Tìm last known good commit.
3. So sánh diff.
4. Revert hoặc tách từng thay đổi.
5. Deploy xanh lại trước.

---

## 15. Quy tắc làm việc với AI/Codex/Claude

Mỗi AI khi nhận task phải đọc file này trước.

Prompt bắt buộc trước khi sửa code:

```text
Đọc AI_WORKING_RULES.md trước.
Không sửa lan.
Không động phần đang ổn.
Chỉ sửa đúng lỗi được giao.
Trước khi sửa, liệt kê file/block sẽ sửa và rủi ro.
Sau khi sửa, chạy/kiểm tra CI hoặc báo rõ chưa kiểm tra được.
```

---

## 16. Checklist trước mỗi commit

Trước khi commit phải tick đủ:

```text
[ ] Tôi đã đọc AI_WORKING_RULES.md
[ ] Tôi biết lỗi nằm ở đâu
[ ] Tôi chỉ sửa file liên quan
[ ] Tôi không động module đang ổn
[ ] Tôi không thêm patch-script prebuild nếu không cần
[ ] Tôi có cách rollback
[ ] Tôi đã kiểm tra TypeScript/build hoặc sẽ theo dõi CI
[ ] Tôi báo rõ commit SHA và trạng thái deploy
```

---

## 17. Nguyên tắc cuối cùng

Làm app thật thì ưu tiên ổn định hơn thông minh.

```text
Ổn định trước.
Đúng nghiệp vụ trước.
Ít bước cho người dùng trước.
Đẹp sau nhưng không được phá logic.
Thông minh sau nhưng phải cho admin duyệt.
```

Nếu có xung đột giữa “làm nhanh” và “giữ app ổn định”, luôn chọn giữ app ổn định.
