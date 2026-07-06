import { redirect } from 'next/navigation';

// /me 沒有獨立內容頁，會員中心入口＝我的訂單。裸連 /me 一律導向 /me/orders，
// 避免使用者點到空白頁（#1594 回報「找不到頁面」）。
export default function MeIndexPage() {
  redirect('/me/orders');
}
