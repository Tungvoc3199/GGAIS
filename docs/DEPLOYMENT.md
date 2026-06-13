# HƯỚNG DẪN TRIỂN KHAI TRIỆT ĐỂ - LỊCH HỌC PRO

Tài liệu hướng dẫn đóng gói biên dịch sản phẩm (Production Build) và chuyển giao hệ thống lên Google Cloud Run cùng bộ dịch vụ Firebase.

## 1. KHÁI QUÁT KIẾN TRÚC SẢN PHẨM

* **Frontend**: SPA phát triển bằng **React 18 + Vite** kết hợp **Tailwind CSS**.
* **Backend**: máy chủ **Node.js + Express** đảm nhận proxy Firebase Admin SDK và thực hiện các nghiệp vụ ghi chép dữ liệu có Audit Log.
* **Database & Auth**: Sử dụng **Firebase Firestore & App Engine Authentication**.

---

## 2. BIÊN DỊCH VÀ ĐÓNG GÓI CỤC BỘ (PRODUCTION BUILD)

Để biên dịch chuẩn trước khi phát hành, chạy chuỗi lệnh sau:

```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Biên dịch và kiểm tra lỗi cú pháp TypeScript
npm run lint

# 3. Biên dịch song song đóng gói Frontend (dist/) và Backend CJS (dist/server.cjs)
npm run build
```

---

## 3. TRIỂN KHAI LÊN GOOGLE CLOUD RUN (DOCKER CONTAINER CONTAINERIZED)

### Bước 1: Khởi tạo Dockerfile
Tạo tệp `Dockerfile` ở thư mục gốc của dự án với cấu hình tối ưu:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

### Bước 2: Build Artifact & Deploy
Sử dụng Google Cloud CLI để đẩy Docker Image lên Artifact Registry và kích hoạt Cloud Run:

```bash
# Định nghĩa Tên Project
gcloud config set project Your_GCP_Project_ID

# Đóng gói và đẩy lên Cloud Build
gcloud builds submit --tag gcr.io/Your_GCP_Project_ID/lich-hoc-pro

# Kích hoạt Cloud Run Service hướng cổng ra ngoài
gcloud run deploy lich-hoc-pro-service \
  --image gcr.io/Your_GCP_Project_ID/lich-hoc-pro \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 3000
```

---

## 4. AN TOÀN BẢO MẬT KHI TRIỂN KHAI
1. **Service Account**: Gán Default Compute Service Account hoặc Custom Service Account của Cloud Run có quyền `Cloud Datastore Owner` và `Storage Object Admin`. Khi chạy trên nền tảng GCP, Firebase Admin SDK tự động tương tác không cần file JSON cục bộ.
2. **Kích hoạt CORS & SSL**: Cloud Run tự động cấp địa chỉ SSL HTTPS chuẩn mã hóa cho ứng dụng.
3. **Cập nhật Security Rules**: Đảm bảo chạy `firebase deploy --only firestore:rules,storage:rules` để đồng bộ các cấu hình bảo vệ trực tiếp cổng rò rỉ khách hàng.
4. **Vô hiệu hóa REST Fallback**: Trên môi trường Production, tuyệt đối đặt cấu hình `ALLOW_DEV_REST_FALLBACK=false` để chặn hoàn toàn mọi ngả đường bypass từ client-side qua cổng fallback dự phòng.
