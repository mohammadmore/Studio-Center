// Column definitions for every Excel import. The guide, the sample file and the
// parser on each page are generated from these, so keep them in step with the
// server code that stores the rows (named next to each definition).
(function () {
  "use strict";
  var X = window.AsvaExcel;
  if (!X) return;

  var names = function (list, field) {
    return (list || []).map(function (x) { return typeof x === "string" ? x : x && (x[field] || x.setting_key || x.name || x.title); }).filter(Boolean);
  };
  var active = function (list) { return (list || []).filter(function (x) { return x && x.is_active !== 0 && x.is_active !== "0"; }); };
  var first = function (list, fallback) { return list && list.length ? list[0] : fallback; };

  // Same names and order as the board columns in the depot (src/routes/api_routes/contents.ts IMPORT_STATUSES).
  var STATUSES = ["ورودی خام", "در صف انتظار", "در حال تولید", "ارزیابی استودیو", "ارزیابی کارفرما", "نیاز به اصلاح", "تکمیل شده", "تایید کارفرما", "آماده انتشار", "منتشر شده"];

  // Depot → POST /api/bulk_import_contents
  X.define("contents", {
    fileName: "Asva_Contents_Sample.xlsx",
    sheetName: "محتواها",
    intro: "هر ردیف فایل یک کارت محتوا در میز کار می‌سازد. فقط «عنوان محتوا» اجباری است.",
    notes: [
      "نام برند، همکار، نوع محتوا و پلتفرم باید همان چیزی باشد که در سیستم ثبت شده؛ بزرگی و کوچکی حروف انگلیسی مهم نیست.",
      "برای چند مقدار در یک خانه (همکاران، مراحل، پلتفرم‌ها) آن‌ها را با ویرگول (، یا ,) جدا کنید.",
      "تاریخ را به‌صورت متن شمسی بنویسید (مثلاً 1405/02/15)؛ اعداد فارسی هم قبول است.",
    ],
    columns: [
      { key: "title", name: "عنوان محتوا", required: true, aliases: ["عنوان", "نام محتوا", "title"], desc: "تیتر کارت محتوا. ردیف بدون عنوان وارد نمی‌شود.", example: "ویدیوی معرفی محصول جدید" },
      { key: "org_name", name: "سازمان / برند", aliases: ["سازمان", "برند", "کارفرما", "نام برند", "org_name", "organization"], desc: "نام برند یا نام کاربری پنل آن. اگر پیدا نشود، محتوا بدون برند ثبت می‌شود.", values: function (c) { return names(c.orgs, "org_name"); }, emptyValues: "هنوز برندی ثبت نشده است" },
      { key: "collection", name: "مجموعه", aliases: ["نام مجموعه", "collection"], desc: "عنوان مجموعه. اگر برای آن برند وجود نداشته باشد، ساخته می‌شود.", values: function (c) { return names(c.collections, "title"); } },
      { key: "content_type", name: "نوع محتوا", aliases: ["نوع", "content_type", "type"], desc: "یکی از انواع محتوای تعریف‌شده در «تنظیمات پایه». اگر خالی بماند، اولین نوع محتوای تنظیمات ثبت می‌شود.", values: function (c) { return names(active(c.settings && c.settings.content_type)); }, emptyValues: "در تنظیمات پایه نوع محتوا تعریف نشده است" },
      { key: "publish_platforms", name: "پلتفرم‌های انتشار", aliases: ["پلتفرم", "پلتفرم‌ها", "پلتفرم ها", "platforms", "publish_platforms"], desc: "یک یا چند پلتفرم، با ویرگول جدا.", values: function (c) { return names(active(c.settings && c.settings.platform)); } },
      { key: "project_manager", name: "مدیر پروژه", aliases: ["project_manager", "manager"], desc: "نام کامل یا نام کاربری یکی از همکاران.", values: function (c) { return names(c.colleagues, "full_name"); } },
      { key: "assigned_colleagues", name: "همکاران", aliases: ["همکاران (با کاما)", "تیم", "assigned_colleagues", "team"], desc: "نام کامل یا نام کاربری همکاران درگیر، با ویرگول جدا. به هر کدام اعلان ارجاع کار می‌رسد.", values: function (c) { return names(c.colleagues, "full_name"); } },
      { key: "stages", name: "مراحل تولید", aliases: ["مراحل تولید (با کاما)", "مراحل", "stages"], desc: "مراحل کار به ترتیب، با ویرگول جدا.", values: function (c) { return names(active(c.settings && c.settings.stages)); } },
      { key: "status", name: "وضعیت", aliases: ["status"], desc: "ستونی از میز کار که کارت در آن قرار می‌گیرد. خالی یا نامعتبر = «ورودی خام».", values: STATUSES },
      { key: "publish_date", name: "تاریخ انتشار", aliases: ["تاریخ", "publish_date"], desc: "تاریخ شمسی به شکل سال/ماه/روز.", example: "1405/02/15" },
      { key: "publish_time", name: "ساعت انتشار", aliases: ["زمان انتشار", "ساعت", "publish_time"], desc: "ساعت و دقیقه، ۲۴ ساعته.", example: "18:00" },
      { key: "caption", name: "کپشن / توضیحات", aliases: ["کپشن", "توضیحات", "caption"], desc: "متن کپشن یا توضیح تولید." },
      { key: "cover_link", name: "لینک کاور", aliases: ["کاور", "cover_link"], desc: "آدرس کامل تصویر کاور (با https://)." },
      { key: "video_link", name: "لینک ویدیو", aliases: ["لینک فایل", "video_link"], desc: "آدرس کامل فایل ویدیو یا ضمیمه (با https://)." },
    ],
    examples: function (c) {
      var org = first(names(c.orgs, "org_name"), "نام برند");
      var types = names(active(c.settings && c.settings.content_type));
      var plats = names(active(c.settings && c.settings.platform));
      var people = names(c.colleagues, "full_name");
      var stages = names(active(c.settings && c.settings.stages));
      return [
        { title: "ویدیوی معرفی محصول جدید", org_name: org, collection: "کمپین بهار", content_type: first(types, "ویدیو"), publish_platforms: plats.slice(0, 2).join("، "), project_manager: first(people, ""), assigned_colleagues: people.slice(1, 3).join("، "), stages: stages.slice(0, 3).join("، "), status: "ورودی خام", publish_date: "1405/02/15", publish_time: "18:00", caption: "متن کپشن…", cover_link: "", video_link: "" },
        { title: "پوستر تخفیف ویژه", org_name: org, collection: "کمپین بهار", content_type: types[1] || first(types, "پوستر"), publish_platforms: first(plats, ""), project_manager: first(people, ""), assigned_colleagues: "", stages: stages.slice(0, 1).join("، "), status: "در صف انتظار", publish_date: "1405/02/20", publish_time: "12:30", caption: "", cover_link: "", video_link: "" },
      ];
    },
  });

  // Calendar → POST /api/bulk_schedule_contents
  X.define("schedule", {
    fileName: "Asva_Schedule.xlsx",
    sheetName: "زمان‌بندی",
    intro: "با این فایل تاریخ و ساعت انتشار محتواهای موجود را یکجا تغییر می‌دهید (محتوای جدید ساخته نمی‌شود). فایل نمونه، فهرست محتواهای همین ماه را با شناسه‌شان دارد؛ کافی است تاریخ و ساعت را ویرایش و دوباره بارگذاری کنید.",
    notes: [
      "شناسه هر محتوا را از فایل نمونه بردارید؛ اگر نام برند با برند آن شناسه یکی نباشد، پیش از ثبت هشدار می‌گیرید.",
      "ردیفی که تاریخش خالی باشد، تاریخ قبلی‌اش را نگه می‌دارد.",
    ],
    columns: [
      { key: "content_id", name: "شناسه محتوا", required: true, aliases: ["شناسه", "id", "content_id"], desc: "عدد شناسه کارت محتوا.", example: "12" },
      { key: "org_name", name: "نام برند", required: true, aliases: ["نام تیم", "تیم", "سازمان", "برند", "سازمان / برند", "org", "org_name"], desc: "نام برند صاحب محتوا؛ برای جلوگیری از جابه‌جا شدن اشتباهی شناسه‌ها چک می‌شود. محتوای بدون برند: «بدون سازمان».", values: function (c) { return ["بدون سازمان"].concat(names(c.orgs, "org_name")); } },
      { key: "title", name: "عنوان محتوا", aliases: ["عنوان", "title"], desc: "فقط برای راحتی شما؛ در ثبت تغییری نمی‌دهد." },
      { key: "publish_date", name: "تاریخ انتشار", aliases: ["تاریخ", "publish_date"], desc: "تاریخ شمسی به شکل سال/ماه/روز.", example: "1405/05/12" },
      { key: "publish_time", name: "ساعت انتشار", aliases: ["زمان انتشار", "ساعت", "publish_time"], desc: "ساعت و دقیقه، ۲۴ ساعته.", example: "10:30" },
    ],
    examples: function (c) {
      var orgName = function (id) { var o = (c.orgs || []).find(function (x) { return x.id == id; }); return o ? o.org_name : "بدون سازمان"; };
      var rows = (c.contents || []).slice(0, 2000).map(function (k) {
        return { content_id: k.id, org_name: orgName(k.org_id), title: k.title || "", publish_date: k.publish_date || "", publish_time: k.publish_time || "" };
      });
      return rows.length ? rows : [{ content_id: "", org_name: "", title: "این ماه محتوایی ندارد", publish_date: "", publish_time: "" }];
    },
  });

  // Collections → POST /api/manage_collections (batch_add)
  X.define("collections", {
    fileName: "Asva_Collections_Sample.xlsx",
    sheetName: "مجموعه‌ها",
    intro: "هر ردیف یک مجموعه (پوشه‌ی محتوا) می‌سازد.",
    notes: [
      "مجموعه‌ای که با همین عنوان برای همان برند وجود داشته باشد، دوباره ساخته نمی‌شود.",
      "برای زیرمجموعه، عنوان مجموعه‌ی والد را بنویسید؛ والد می‌تواند از قبل وجود داشته باشد یا در همین فایل باشد.",
    ],
    columns: [
      { key: "title", name: "عنوان مجموعه", required: true, aliases: ["عنوان", "نام مجموعه", "title"], desc: "نام مجموعه.", example: "ویدیوهای آموزشی بخش ۱" },
      { key: "org", name: "سازمان / برند", aliases: ["نام کاربری سازمان", "نام کاربری سازمان (اختیاری)", "سازمان", "برند", "نام برند", "org", "org_username"], desc: "نام برند یا نام کاربری پنل آن. خالی یا برند ناموجود = مجموعه‌ی عمومی بدون برند.", values: function (c) { return names(c.orgs, "org_name"); } },
      { key: "parent", name: "مجموعه والد", aliases: ["والد", "parent"], desc: "عنوان مجموعه‌ای که این مجموعه زیرمجموعه‌ی آن است.", values: function (c) { return names(c.collections, "title"); } },
    ],
    examples: function (c) {
      var org = first(names(c.orgs, "org_name"), "");
      return [
        { title: "کمپین بهار", org: org, parent: "" },
        { title: "ویدیوهای آموزشی بخش ۱", org: org, parent: "کمپین بهار" },
      ];
    },
  });

  // Organizations → POST /api/manage_orgs (batch_add)
  X.define("organizations", {
    fileName: "Asva_Brands_Sample.xlsx",
    sheetName: "برندها",
    intro: "هر ردیف یک برند (کارفرما) می‌سازد. فقط «نام برند» اجباری است.",
    notes: [
      "برندی که نام یا نام کاربری‌اش قبلاً ثبت شده باشد، دوباره ساخته نمی‌شود.",
      "اگر نام کاربری و رمز عبور بدهید، برند می‌تواند وارد پنل کارفرما شود؛ رمز عبور حداقل ۶ کاراکتر است.",
      "برای چند ایمیل، آدرس یا شماره‌ی دیگر، آن‌ها را با ویرگول جدا کنید.",
    ],
    columns: [
      { key: "org_name", name: "نام برند", required: true, aliases: ["نام سازمان", "سازمان / برند", "برند", "سازمان", "org_name"], desc: "نام برند همان‌طور که در سیستم نمایش داده می‌شود.", example: "کلینیک ونوس" },
      { key: "industry", name: "حوزه فعالیت", aliases: ["نوع قرارداد", "صنعت", "حوزه", "industry"], desc: "یکی از حوزه‌های تعریف‌شده در «تنظیمات پایه». خالی = «سایر»؛ متنی که در فهرست نباشد همان‌طور ثبت می‌شود.", values: function (c) { return names(active(c.settings && c.settings.industry)); } },
      { key: "contact_name", name: "نام رابط", aliases: ["رابط", "contact_name"], desc: "نام شخص رابط در برند.", example: "علی محمدی" },
      { key: "phone_number", name: "تلفن", aliases: ["شماره تماس", "موبایل", "تلفن رابط", "phone", "phone_number"], desc: "شماره‌ی اصلی تماس.", example: "09123456789" },
      { key: "extra_phones", name: "تلفن‌های دیگر", aliases: ["شماره تماس‌های اضافه", "تلفن دیگر", "extra_phones"], desc: "شماره‌های بیشتر، با ویرگول جدا." },
      { key: "emails", name: "ایمیل", aliases: ["ایمیل‌ها", "email", "emails"], desc: "یک یا چند ایمیل، با ویرگول جدا.", example: "info@example.com" },
      { key: "addresses", name: "آدرس", aliases: ["آدرس‌ها", "address", "addresses"], desc: "یک یا چند آدرس؛ چند آدرس را با «|» جدا کنید." },
      { key: "color", name: "رنگ سازمانی", aliases: ["رنگ سازمانی (Hex)", "رنگ", "color"], desc: "کد رنگ شش‌رقمی. خالی = بنفش پیش‌فرض (#6366F1).", example: "#EF4444" },
      { key: "username", name: "نام کاربری پنل", aliases: ["نام کاربری", "نام کاربری پورتال", "username"], desc: "برای ورود برند به پنل کارفرما؛ باید یکتا و انگلیسی باشد.", example: "venus" },
      { key: "password", name: "رمز عبور پنل", aliases: ["رمز عبور", "رمز", "رمز عبور پورتال", "password"], desc: "حداقل ۶ کاراکتر. بدون نام کاربری استفاده نمی‌شود." },
    ],
    examples: function (c) {
      var ind = names(active(c.settings && c.settings.industry));
      return [
        { org_name: "کلینیک ونوس", industry: first(ind, "سایر"), contact_name: "علی محمدی", phone_number: "09123456789", extra_phones: "", emails: "info@example.com", addresses: "تهران، خیابان ولیعصر", color: "#EF4444", username: "venus", password: "" },
      ];
    },
  });

  // Templates → POST /api/manage_content_template (batch_add)
  X.define("templates", {
    fileName: "Asva_Templates_Sample.xlsx",
    sheetName: "قالب‌ها",
    intro: "هر ردیف یک آیتم از یک قالب ماهانه است. ردیف‌هایی که «نام قالب» یکسان دارند، آیتم‌های همان قالب می‌شوند.",
    notes: [
      "قالبی که با همین نام وجود داشته باشد، دوباره ساخته نمی‌شود.",
      "با اعمال قالب در تقویم، برای هر آیتم در «روز ماه» همان ماه یک پیشنهاد محتوا ساخته می‌شود.",
    ],
    columns: [
      { key: "name", name: "نام قالب", required: true, aliases: ["قالب", "name"], desc: "نام پکیج یا قالب.", example: "پکیج پایه" },
      { key: "day", name: "روز ماه", aliases: ["فاصله روز", "روز", "day", "dayOffset"], desc: "روزی از ماه (۱ تا ۳۱) که این محتوا باید منتشر شود. خالی = روز ۱.", example: "3" },
      { key: "type", name: "نوع محتوا", aliases: ["نوع", "type"], desc: "یکی از انواع محتوای «تنظیمات پایه»؛ همین نوع روی پیشنهاد محتوا می‌نشیند.", values: function (c) { return names(active(c.settings && c.settings.content_type)); } },
      { key: "topic", name: "موضوع", aliases: ["topic"], desc: "موضوع یا ایده‌ی محتوا.", example: "معرفی محصول" },
      { key: "count", name: "تعداد", aliases: ["count"], desc: "تعداد محتوا از این نوع در همان روز. خالی = ۱.", example: "1" },
    ],
    examples: function (c) {
      var types = names(active(c.settings && c.settings.content_type));
      return [
        { name: "پکیج پایه", day: 1, type: first(types, "پست"), topic: "معرفی محصول", count: 1 },
        { name: "پکیج پایه", day: 3, type: types[1] || first(types, "استوری"), topic: "پشت صحنه", count: 2 },
      ];
    },
  });

  // Media library → POST /api/save_media (batch_add)
  var MEDIA_TYPES = ["تصویر / لوگو 🖼️", "فایل لایه‌باز / وکتور 🎨", "فونت سازمانی 🔤", "سند / راهنمای برند 📄", "صدا / موشن 🎵"];
  X.MEDIA_TYPES = MEDIA_TYPES;
  /** Maps a loosely written type ("لوگو", "وکتور", "pdf") to the library's own type names. */
  X.mediaType = function (v) {
    var s = X.norm(v);
    if (!s) return MEDIA_TYPES[0];
    var exact = MEDIA_TYPES.find(function (t) { return X.norm(t.replace(/[^؀-ۿ\s\/a-z]/gi, "")) === s.replace(/[^؀-ۿ\s\/a-z]/gi, "").trim(); });
    if (exact) return exact;
    if (/لایه|وکتور|psd|ai|eps|svg/.test(s)) return MEDIA_TYPES[1];
    if (/فونت|font|ttf|otf|woff/.test(s)) return MEDIA_TYPES[2];
    if (/سند|راهنما|pdf|doc/.test(s)) return MEDIA_TYPES[3];
    if (/صدا|موشن|موسیقی|ویدیو|audio|video|mp3|mp4/.test(s)) return MEDIA_TYPES[4];
    return MEDIA_TYPES[0];
  };
  X.define("media", {
    fileName: "Asva_Media_Sample.xlsx",
    sheetName: "فایل‌ها",
    intro: "هر ردیف یک لینک فایل را به کتابخانه‌ی دارایی‌های دیجیتال اضافه می‌کند (خود فایل آپلود نمی‌شود).",
    notes: [
      "لینک باید با https:// یا http:// شروع شود؛ ردیف‌هایی که لینک نامعتبر دارند رد می‌شوند.",
      "فایلی که با همین نام و لینک قبلاً ثبت شده باشد، دوباره اضافه نمی‌شود.",
    ],
    columns: [
      { key: "asset_name", name: "نام فایل", required: true, aliases: ["نام", "عنوان", "asset_name"], desc: "نام و توضیح کوتاه فایل.", example: "فایل لایه‌باز لوگو" },
      { key: "asset_type", name: "نوع فایل", aliases: ["نوع", "asset_type"], desc: "یکی از انواع زیر (نوشتن بخشی از نام هم کافی است، مثلاً «وکتور»). خالی = تصویر / لوگو.", values: MEDIA_TYPES },
      { key: "file_url", name: "لینک مستقیم", required: true, aliases: ["لینک", "آدرس", "لینک فایل", "url", "file_url"], desc: "آدرس کامل فایل در درایو، دراپ‌باکس یا هر سایت دیگر.", example: "https://drive.google.com/..." },
      { key: "org", name: "سازمان / برند", aliases: ["نام کاربری سازمان", "نام کاربری سازمان (اختیاری)", "سازمان", "برند", "نام برند", "org_username"], desc: "نام برند یا نام کاربری پنل آن. خالی یا برند ناموجود = فایل عمومی استودیو.", values: function (c) { return names(c.orgs, "org_name"); } },
    ],
    examples: function (c) {
      return [{ asset_name: "فایل لایه‌باز لوگو", asset_type: MEDIA_TYPES[1], file_url: "https://drive.google.com/file/d/...", org: first(names(c.orgs, "org_name"), "") }];
    },
  });

  // Smart events → POST /api/upload_smart_events
  X.define("events", {
    fileName: "Asva_Events_Sample.xlsx",
    sheetName: "مناسبت‌ها",
    intro: "هر ردیف یک مناسبت به بانک مناسبت‌ها اضافه می‌کند. روز و ماه را در همان تقویمی بنویسید که در «نوع تقویم» آمده است.",
    notes: [
      "مناسبتی که با همین عنوان، روز، ماه و برند قبلاً ثبت شده باشد، دوباره اضافه نمی‌شود.",
      "فایل‌های قدیمی بدون ردیف عنوان (به ترتیب: عنوان، نوع تقویم، روز، ماه، سال مبنا، تعطیلی، اختصاصی، نام سازمان) هم پذیرفته می‌شوند.",
    ],
    positional: ["title", "calendar", "day", "month", "base_year", "holiday", "_custom", "org"],
    columns: [
      { key: "title", name: "عنوان مناسبت", required: true, aliases: ["عنوان", "مناسبت", "title"], desc: "نام مناسبت.", example: "روز پزشک" },
      { key: "calendar", name: "نوع تقویم", required: true, aliases: ["تقویم", "calendar_type"], desc: "تقویمی که روز و ماه بر اساس آن است.", values: ["شمسی", "قمری", "میلادی"], example: "شمسی" },
      { key: "day", name: "روز", required: true, aliases: ["day"], desc: "عدد روز (۱ تا ۳۱).", example: "1" },
      { key: "month", name: "ماه", required: true, aliases: ["month"], desc: "عدد ماه (۱ تا ۱۲) در همان تقویم.", example: "6" },
      { key: "base_year", name: "سال مبنا", aliases: ["سال", "base_year"], desc: "سالی که روز و ماه در آن معتبر است (برای تبدیل تقویم قمری و میلادی). خالی = سال جاری شمسی.", example: "1405" },
      { key: "holiday", name: "تعطیل رسمی", aliases: ["تعطیلی", "تعطیل", "is_holiday"], desc: "«بله» یا ۱ برای روز تعطیل؛ خالی یا «خیر» یا ۰ برای روز کاری.", values: ["بله", "خیر"], example: "خیر" },
      { key: "org", name: "برند اختصاصی", aliases: ["نام سازمان", "سازمان", "برند", "سازمان / برند"], desc: "برای مناسبت مخصوص یک برند (مثل سالگرد تاسیس) نام یا نام کاربری آن برند. خالی = مناسبت عمومی برای همه. برند ناموجود ثبت نمی‌شود و مناسبت عمومی می‌ماند.", values: function (c) { return names(c.orgs, "org_name"); } },
      { key: "description", name: "توضیحات", aliases: ["توضیح", "description"], desc: "توضیح یا ایده‌ی محتوایی برای این مناسبت." },
    ],
    examples: function (c) {
      return [
        { title: "روز پزشک", calendar: "شمسی", day: 1, month: 6, base_year: 1405, holiday: "خیر", org: "", description: "" },
        { title: "عید نوروز", calendar: "شمسی", day: 1, month: 1, base_year: 1405, holiday: "بله", org: "", description: "" },
        { title: "سالگرد تاسیس برند", calendar: "میلادی", day: 15, month: 8, base_year: 2026, holiday: "خیر", org: first(names(c.orgs, "org_name"), ""), description: "" },
      ];
    },
  });
})();
