# TD88 - QR Payment

Hệ thống tạo mã QR thanh toán tích hợp SePay webhook.

## Tính năng

- Tạo mã QR thanh toán VietQR
- Tự động sinh mã giao dịch SEVQR
- Xác nhận giao dịch real-time qua webhook SePay
- Timeout 30 phút cho mỗi giao dịch
- Lưu trữ lịch sử giao dịch

## Cài đặt local

```bash
npm install
npm run dev
```

Mở http://localhost:3000

## Cấu hình

Tạo file `.env` ở thư mục gốc:

```env
SEPAY_API_KEY=your_sepay_api_key_here
```

## Deploy lên VPS

### Yêu cầu

- VPS Ubuntu 20.04+ hoặc CentOS 7+
- Node.js 18+ 
- PM2 (process manager)
- Nginx (reverse proxy)

### Bước 1: Cài đặt Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### Bước 2: Cài đặt PM2

```bash
sudo npm install -g pm2
```

### Bước 3: Upload code lên VPS

```bash
# Tạo thư mục
sudo mkdir -p /var/www/qr-payment
cd /var/www/qr-payment

# Clone hoặc upload code
git clone <your-repo-url> .
# Hoặc scp từ máy local
```

### Bước 4: Cấu hình environment

```bash
# Tạo file .env
nano .env
```

Thêm nội dung:
```env
SEPAY_API_KEY=your_sepay_api_key_here
```

### Bước 5: Build và chạy

```bash
# Cài dependencies
npm install

# Build production
npm run build

# Chạy với PM2
pm2 start npm --name "qr-payment" -- start

# Lưu config PM2
pm2 save

# Tự động khởi động khi reboot
pm2 startup
```

### Bước 6: Cấu hình Nginx

```bash
sudo nano /etc/nginx/sites-available/qr-payment
```

Thêm nội dung:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt site:

```bash
sudo ln -s /etc/nginx/sites-available/qr-payment /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 7: Cài SSL (HTTPS)

```bash
# Cài Certbot
sudo apt install certbot python3-certbot-nginx

# Lấy SSL certificate
sudo certbot --nginx -d your-domain.com

# Tự động gia hạn
sudo certbot renew --dry-run
```

### Bước 8: Cấu hình Webhook SePay

1. Đăng nhập vào tài khoản SePay
2. Vào **Cài đặt > Webhook**
3. Thêm URL webhook: `https://your-domain.com/api/webhook`
4. Lưu API Key vào file `.env` trên VPS

## Các lệnh PM2 hữu ích

```bash
# Xem trạng thái
pm2 status

# Xem logs
pm2 logs qr-payment

# Restart
pm2 restart qr-payment

# Stop
pm2 stop qr-payment

# Xem monitoring
pm2 monit
```

## Cấu trúc thư mục

```
├── pages/
│   ├── index.js          # Trang chính tạo QR
│   └── api/
│       ├── bankaccounts.js    # API lấy danh sách tài khoản
│       ├── webhook.js         # Nhận webhook từ SePay
│       └── check-transaction.js # Kiểm tra giao dịch
├── lib/
│   └── transactions.js   # Quản lý lưu trữ giao dịch
├── data/
│   └── transactions.json # File lưu giao dịch
├── public/
│   └── favicon.png       # Logo
├── styles/
│   └── globals.css       # CSS styles
└── .env                  # Environment variables
```

## API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/bankaccounts` | GET | Lấy danh sách tài khoản ngân hàng |
| `/api/webhook` | POST | Nhận thông báo giao dịch từ SePay |
| `/api/webhook` | GET | Xem danh sách giao dịch đã nhận |
| `/api/check-transaction` | GET | Kiểm tra trạng thái giao dịch |

## Troubleshooting

### Lỗi permission thư mục data

```bash
sudo chown -R $USER:$USER /var/www/qr-payment/data
chmod 755 /var/www/qr-payment/data
```

### PM2 không chạy sau reboot

```bash
pm2 unstartup
pm2 startup
pm2 save
```

### Nginx 502 Bad Gateway

```bash
# Kiểm tra app có đang chạy không
pm2 status

# Kiểm tra port
netstat -tlnp | grep 3000
```
