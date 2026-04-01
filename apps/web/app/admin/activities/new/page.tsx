// 此頁已廢棄：新增行程改由列表頁直接建立並跳轉 edit
// 保留此檔案以防舊書籤導流，自動導回列表
import { redirect } from 'next/navigation';
export default function AdminActivityNewRedirect() {
  redirect('/admin/activities');
}
