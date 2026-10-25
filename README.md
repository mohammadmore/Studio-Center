# Asva Studio

سیستم مدیریت محتوا و استودیو: دپوی محتوا، تقویم انتشار، مناسبت‌ها، سازمان‌ها و پورتال کارفرما، تیم و مرخصی، مالی و فاکتور.

## اجرا در حالت توسعه
```bash
npm install
cp .env.example .env   # SESSION_SECRET را پر کنید یا در توسعه خالی بگذارید
npm run dev            # http://localhost:3000
```

## دستورات
| دستور | کار |
|---|---|
| `npm run dev` | اجرای توسعه با بارگذاری مجدد |
| `npm run build` / `npm start` | بیلد و اجرای production |
| `npm test` | تست‌های خودکار |
| `npm run typecheck` | بررسی TypeScript |
| `npm run migrate -- --from firebase --to json` | انتقال داده بین درایورهای ذخیره‌سازی |

## ساختار
- `server.ts`: راه‌اندازی؛ ابتدا داده‌ها را بارگذاری می‌کند و بعد درخواست می‌پذیرد
- `src/app.ts`: تنظیمات Express، امنیت، نشست
- `src/store/`: وضعیت در حافظه و درایورهای ذخیره‌سازی (`json`، `sqlite`، `firebase`)
- `src/routes/`: صفحات و API
- `src/middleware/auth.ts`: احراز هویت و دسترسی‌ها
- `views/`: قالب‌های EJS

استقرار روی هاست: [DEPLOY.md](DEPLOY.md)
