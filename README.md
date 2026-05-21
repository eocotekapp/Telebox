# TeleBox API Tester

Project nhỏ để kiểm tra API token TeleBox thật sự hoạt động không.

## Chạy trên Android Termux

Không chạy trong `/sdcard` vì npm dễ lỗi symlink. Hãy copy vào thư mục home của Termux:

```bash
cd ~
cp -r /sdcard/telebox-api-tester ~/telebox-api-tester
cd ~/telebox-api-tester
rm -rf node_modules package-lock.json
npm install --no-bin-links
npm start
```

Mở: `http://localhost:3000`

## Deploy Vercel

Đẩy toàn bộ thư mục này lên GitHub rồi import vào Vercel. Không cần cấu hình env vì token đã hardcode theo yêu cầu.

## Test nên bấm theo thứ tự

1. Test token / folder_details root
2. Search root
3. Create folder
4. Upload file test

Mỗi nút sẽ hiện log raw từ TeleBox để biết lỗi thật.
