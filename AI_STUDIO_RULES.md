# AI STUDIO RULES

## QUY TẮC BẮT BUỘC TRƯỚC KHI SỬA CODE:

1. Đọc file AI_STUDIO_RULES.md trước khi sửa.
2. Tuyệt đối không sửa, xóa, ghi đè hoặc động vào thư mục `.github/workflows`.
3. Tuyệt đối không sửa, xóa, ghi đè các file CI/CD, deploy, GitHub Actions.
4. Tuyệt đối không xóa hoặc thay đổi workflow Deploy Cloud Run.
5. Tuyệt đối không xóa hoặc thay đổi file AI_STUDIO_RULES.md.
6. Không đổi script package.json verify. Script verify phải là: `npm run lint && npm run build && npm run verify:static`
7. Chỉ sửa đúng các file được yêu cầu trong prompt.
8. Không refactor lan man, không đổi kiến trúc, không đổi tên biến/hàm nếu không cần.
9. Sau khi sửa phải báo rõ đã sửa file nào, lý do sửa, và chạy kiểm tra:
   - npm run lint
   - npm run build
   - npm run verify
10. Không báo hoàn thành nếu build lỗi.
