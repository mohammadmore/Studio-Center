import * as jalaali from "jalaali-js";

export function addDaysToJalali(dateStr: string, days: number) {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  const dateObj = new Date(gy, gm - 1, gd);
  dateObj.setDate(dateObj.getDate() + days);
  const result = jalaali.toJalaali(dateObj);
  const paddedMonth = result.jm.toString().padStart(2, "0");
  const paddedDay = result.jd.toString().padStart(2, "0");
  return `${result.jy}/${paddedMonth}/${paddedDay}`;
}

export function toPersianDigits(num: string | number) {
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return num
    .toString()
    .replace(/\d/g, (x) => persianDigits[parseInt(x)]);
}
