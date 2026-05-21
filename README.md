# TeleBox Drive Mobile UI

Bản UI mới dễ dùng hơn cho TeleBox API:

- Không cần nhập số `0` / Folder ID thủ công.
- Có dropdown chọn thư mục Root hoặc folder đã tạo.
- Upload file vào thư mục đang chọn.
- Tìm kiếm và quản lý file/folder dạng thẻ dễ nhìn trên điện thoại.
- Share, đổi tên file, xóa file/folder.
- Token đã hardcode trong `server.js` theo yêu cầu.

## Chạy trên Android Termux

Không chạy trực tiếp trong `/sdcard` vì Android chặn symlink của npm. Hãy copy vào thư mục home của Termux:

```bash
termux-setup-storage
cd ~
cp -r /sdcard/telebox-web/telebox-web ~/telebox-web
cd ~/telebox-web
rm -rf node_modules package-lock.json
npm install
npm start
```

Nếu `npm install` vẫn báo lỗi symlink:

```bash
npm install --no-bin-links
npm start
```

Mở Chrome trên Android:

```text
http://localhost:3000
```

## Chạy trên Windows / PC

```bash
npm install
npm start
```

Sau đó mở:

```text
http://localhost:3000
```

## Deploy Vercel

Có thể push lên GitHub rồi import vào Vercel. Token đang nằm trong code nên deploy là chạy, không cần cấu hình env.

## Lưu ý

Tài liệu API TeleBox không có endpoint tải/xem file trực tiếp. Web có thể upload, tìm kiếm, quản lý và tạo share link/token. Nếu TeleBox trả `cover` cho ảnh thì web sẽ hiện thumbnail; nếu không có thì hiện icon file.
