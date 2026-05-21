# TeleBox Drive Easy - Vercel Fix

Bản đã sửa lỗi deploy Vercel:
- Express export default app cho serverless
- Danh sách thư mục dùng file_search thay vì folder_details
- Token đã gắn sẵn trong server.js

## Chạy Termux
```bash
cd ~/telebox-drive-easy
npm install --no-bin-links
npm start
```

## Deploy Vercel
Push toàn bộ thư mục này lên GitHub rồi Import vào Vercel. Không cần env nếu chấp nhận token hardcode.
