import styles from './services.module.css';
import type { ServiceDraftQuestion } from './service-types';

export function QuestionPreview({ questions }: { questions: ServiceDraftQuestion[] }) {
  if (questions.length === 0) return <p className={styles.empty}>尚未加入自訂問題，旅人會直接看到服務內容。</p>;
  return (
    <div className={styles.questionPreview} aria-label="問卷預覽">
      {questions.map((question, index) => (
        <div className={styles.questionPreviewItem} key={`${question.question_key}-${index}`}>
          <strong>{question.label || question.question_key || `第 ${index + 1} 題`}{question.required ? '＊' : ''}</strong>
          <span className={styles.hint}>
            {question.type === 'single_choice' ? `單選：${question.options.filter(Boolean).join('、') || '尚未設定選項'}` : null}
            {question.type === 'multi_choice' ? `複選：${question.options.filter(Boolean).join('、') || '尚未設定選項'}` : null}
            {question.type === 'short_text' ? '簡短文字回答' : null}
            {question.type === 'long_text' ? '長文字回答' : null}
          </span>
        </div>
      ))}
    </div>
  );
}
