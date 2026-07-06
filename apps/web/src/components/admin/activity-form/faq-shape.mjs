/**
 * FAQ 編輯器 shape 正規化（管理者後台 activity 編輯頁）。
 *
 * 儲存層（activities.faq）自 #342 起一律以 canonical `{question, answer}` 存放
 * （PUT route 的 buildFaqPatch 會把送進來的 `{q,a}` 或 `{question,answer}` 都轉成
 * `{question, answer}`）。但後台 FaqEditorCard 讀的是 `{q, a}` 欄位，若把儲存層原樣
 * 灌進 state，既有 FAQ 會因欄位名不符而「顯示成空白」——這正是「既有 QA 沒顯示在後台」
 * 的成因。
 *
 * 這支 helper 把任一 shape（含大小寫欄位、legacy）統一轉成後台編輯器用的 `{q, a}`，
 * 讓載入既有行程與 JSON 匯入都能正確帶出既有問答；儲存時再由 PUT route 轉回 canonical。
 *
 * @param {unknown} raw
 * @returns {Array<{ q: string, a: string }>}
 */
export function toEditorFaq(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      q: String(entry.q ?? entry.question ?? ''),
      a: String(entry.a ?? entry.answer ?? ''),
    }));
}
