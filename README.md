# 🎬 MinIO Video Viewer

Công cụ để xem video từ MinIO bucket một cách dễ dàng.

## 🚀 Cài đặt

```bash
# Cài đặt dependencies
npm install

# Hoặc cài đặt thủ công
npm install minio
```

## 📋 Cấu hình

File `minio-config.json` chứa thông tin kết nối (đừng commit khóa thật):
- **Endpoint**: ví dụ `doc.hoclientuc.vn`
- **Port**: `443` khi `useSSL: true` (mặc định), hoặc `9000` khi không SSL
- **Access Key/Secret Key**: đặt qua file hoặc biến môi trường

## 🎯 Cách sử dụng

### 1. Chạy server viewer
```bash
npm start
# Mở trình duyệt: http://localhost:3000
```

### 2. Sử dụng trong code
API server có sẵn:
- `GET /` trả về trang `minio-viewer.html`
- `GET /api/media` trả JSON danh sách media mới nhất từ MinIO
- `GET /media/{objectName}` proxy trực tiếp file từ MinIO

## 🔧 Tính năng

- ✅ **Tự phát hiện media**: video/hình ảnh theo phần mở rộng
- ✅ **Viewer HTML**: Trang UI đẹp, auto refresh, phát video qua proxy
- ✅ **Proxy an toàn**: Không lộ khoá, CORS bật sẵn, cache hợp lý
- ✅ **Config linh hoạt**: Đọc từ `minio-config.json` hoặc biến môi trường

## 📱 Các cách xem video

### 1. **Xem trực tiếp qua URL**
```javascript
const url = await viewer.getVideoUrl('bucket-name', 'video.mp4');
console.log('Mở URL này trong trình duyệt:', url);
```

### 2. **Tạo trang HTML**
```javascript
const html = viewer.generateVideoHTML(url, 'video-name');
// Lưu HTML và mở trong trình duyệt
```

### 3. **Tải về máy**
```javascript
await viewer.downloadVideo('bucket-name', 'video.mp4', './my-video.mp4');
```

## 🎬 Định dạng video hỗ trợ

- MP4 (.mp4)
- AVI (.avi)
- MOV (.mov)
- MKV (.mkv)
- WMV (.wmv)
- FLV (.flv)
- WebM (.webm)
- M4V (.m4v)

## 🔒 Bảo mật

- Không log Access/Secret key ra console
- Cho phép HTTPS theo cấu hình `useSSL`
- Tránh commit thông tin nhạy cảm

## 📞 Hỗ trợ

Nếu gặp lỗi, kiểm tra:
1. MinIO server có đang chạy không
2. Access Key và Secret Key có đúng không
3. Bucket có tồn tại không
4. File video có trong bucket không

