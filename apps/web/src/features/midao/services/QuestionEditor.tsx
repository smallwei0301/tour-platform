import styles from './services.module.css';
import type { ServiceDraftQuestion, ServiceDraftPayload, QuestionType } from './service-types';

interface QuestionEditorProps {
  question: ServiceDraftQuestion;
  index: number;
  total: number;
  onChange: (question: ServiceDraftQuestion) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'short_text', label: '簡短文字' },
  { value: 'long_text', label: '長文字' },
  { value: 'single_choice', label: '單選' },
  { value: 'multi_choice', label: '複選' },
];

export function QuestionEditor({ question, index, total, onChange, onRemove, onMove }: QuestionEditorProps) {
  const isChoice = question.type === 'single_choice' || question.type === 'multi_choice';
  const update = (patch: Partial<ServiceDraftQuestion>) => onChange({ ...question, ...patch });
  return (
    <article className={styles.questionCard} aria-label={`第 ${index + 1} 題`}>
      <div className={styles.questionHeader}>
        <span className={styles.questionIndex}>第 {index + 1} 題</span>
        <div className={styles.questionActions}>
          <button className={styles.iconButton} type="button" aria-label={`第 ${index + 1} 題上移`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button className={styles.iconButton} type="button" aria-label={`第 ${index + 1} 題下移`} disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button className={styles.iconButton} type="button" aria-label={`刪除第 ${index + 1} 題`} onClick={onRemove}>×</button>
        </div>
      </div>
      <div className={styles.questionGrid}>
        <div className={styles.field}>
          <label htmlFor={`question-label-${index}`}>題目名稱</label>
          <input id={`question-label-${index}`} value={question.label ?? ''} onChange={(event) => update({ label: event.target.value })} placeholder="旅人會看到的題目" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`question-type-${index}`}>回答方式</label>
          <select id={`question-type-${index}`} value={question.type} onChange={(event) => update({ type: event.target.value as QuestionType, options: [] })}>
            {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`question-key-${index}`}>題目代碼</label>
        <input id={`question-key-${index}`} value={question.question_key} onChange={(event) => update({ question_key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="例如：party_size" />
        <small>只用小寫英數字與底線，方便系統保存答案。</small>
      </div>
      {isChoice ? (
        <div className={styles.field}>
          <label>選項</label>
          <div className={styles.options}>
            {question.options.map((option, optionIndex) => (
              <div className={styles.optionRow} key={`${index}-${optionIndex}`}>
                <input aria-label={`第 ${index + 1} 題選項 ${optionIndex + 1}`} value={option} onChange={(event) => update({ options: question.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) })} placeholder={`選項 ${optionIndex + 1}`} />
                <button className={styles.iconButton} type="button" aria-label={`刪除選項 ${optionIndex + 1}`} onClick={() => update({ options: question.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}>×</button>
              </div>
            ))}
            <button className={styles.secondaryButton} type="button" onClick={() => update({ options: [...question.options, ''] })}>＋ 新增選項</button>
          </div>
        </div>
      ) : null}
      <label className={styles.hint}>
        <input type="checkbox" checked={question.required} onChange={(event) => update({ required: event.target.checked })} />{' '}設為必填
      </label>
    </article>
  );
}

export function createEmptyQuestion(sortOrder: number): ServiceDraftQuestion {
  return { question_key: '', type: 'short_text', options: [], required: false, sort_order: sortOrder, label: '' };
}
