// #1758 S2 · Task 23 — 自訂問卷題目的 application-layer 驗證。
//
// S1 schema（activity_intake_questions）已用 CHECK constraints 當最後防線，
// 本模組在存進資料庫「之前」先擋一次，回傳友善且逐條的錯誤訊息，讓呼叫端
// 決定如何處理（不 throw）。驗證規則刻意比照 S1 的 constraints：
//   - type：single_choice / multi_choice / short_text / long_text
//   - choice 型 options 必須是非空、無重複的字串陣列
//   - text 型 options 必須是空陣列（[]）
//   - required：boolean（缺省視為 false）
//   - sort_order：>=0 整數（缺省視為 0）
//   - question_key：非空 snake_case 字串（^[a-z0-9_]+$）

/** 允許的題型，對照 S1 midao_activity_intake_questions_type_check。 */
export const INTAKE_QUESTION_TYPES = Object.freeze([
  'single_choice',
  'multi_choice',
  'short_text',
  'long_text',
]);

const CHOICE_TYPES = Object.freeze(['single_choice', 'multi_choice']);
const TEXT_TYPES = Object.freeze(['short_text', 'long_text']);

// question_key 沿用專案既有的小寫 ASCII slug 精神，但採 snake_case（底線分隔），
// 與 activity-plan-slugs 的連字號 slug 是不同用途，故在此獨立定義而非硬套。
const QUESTION_KEY_PATTERN = /^[a-z0-9_]+$/;

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 驗證單一自訂問卷題目。
 *
 * @param {unknown} question
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateIntakeQuestion(question) {
  const errors = [];

  if (!isPlainObject(question)) {
    return {
      valid: false,
      errors: ['question 必須是物件（{ question_key, type, options, required, sort_order }）。'],
    };
  }

  // --- question_key ---
  const { question_key: questionKey } = question;
  if (questionKey === undefined || questionKey === null) {
    errors.push('question_key 為必填，且不可為空字串。');
  } else if (typeof questionKey !== 'string') {
    errors.push('question_key 必須是字串。');
  } else if (!isNonEmptyString(questionKey)) {
    errors.push('question_key 不可為空字串。');
  } else if (!QUESTION_KEY_PATTERN.test(questionKey)) {
    errors.push(
      `question_key「${questionKey}」格式錯誤：僅允許小寫英數字與底線（^[a-z0-9_]+$）。`,
    );
  }

  // --- type ---
  const { type } = question;
  const typeValid = typeof type === 'string' && INTAKE_QUESTION_TYPES.includes(type);
  if (!typeValid) {
    const shown = type === undefined ? '（缺漏）' : JSON.stringify(type);
    errors.push(
      `type ${shown} 不是允許的題型，必須是 ${INTAKE_QUESTION_TYPES.join(' / ')} 其中之一。`,
    );
  }

  // --- options（依 type 決定形狀；type 不合法時跳過，避免誤導的連鎖錯誤）---
  if (typeValid) {
    const hasOptions = question.options !== undefined && question.options !== null;
    const options = hasOptions ? question.options : [];

    if (CHOICE_TYPES.includes(type)) {
      if (!Array.isArray(options)) {
        errors.push(`options 必須是陣列；${type} 題型需要至少一個選項。`);
      } else if (options.length === 0) {
        errors.push(`${type} 題型的 options 不可為空，至少需要一個選項。`);
      } else {
        const allNonEmptyStrings = options.every((opt) => isNonEmptyString(opt));
        if (!allNonEmptyStrings) {
          errors.push('options 內的每個選項都必須是非空字串。');
        } else {
          const seen = new Set();
          const duplicates = new Set();
          for (const opt of options) {
            const key = opt.trim();
            if (seen.has(key)) duplicates.add(key);
            seen.add(key);
          }
          if (duplicates.size > 0) {
            errors.push(
              `options 不可有重複值：${[...duplicates].join('、')}。`,
            );
          }
        }
      }
    } else if (TEXT_TYPES.includes(type)) {
      if (!Array.isArray(options)) {
        errors.push(`options 必須是陣列；${type} 題型的 options 必須是空陣列 []。`);
      } else if (options.length > 0) {
        errors.push(`${type} 題型不可帶 options，必須是空陣列 []。`);
      }
    }
  }

  // --- required（缺省視為 false）---
  if (question.required !== undefined && typeof question.required !== 'boolean') {
    errors.push('required 必須是 boolean（true/false）；缺省時視為 false。');
  }

  // --- sort_order（缺省視為 0）---
  if (question.sort_order !== undefined) {
    const { sort_order: sortOrder } = question;
    if (
      typeof sortOrder !== 'number' ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      errors.push('sort_order 必須是 >= 0 的整數；缺省時視為 0。');
    }
  }

  return { valid: errors.length === 0, errors };
}
