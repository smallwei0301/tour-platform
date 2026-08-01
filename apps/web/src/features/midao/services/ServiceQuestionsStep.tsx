import styles from './services.module.css';
import { createEmptyQuestion, QuestionEditor } from './QuestionEditor';
import { QuestionPreview } from './QuestionPreview';
import type { ServiceDraftPayload, ServiceDraftQuestion } from './service-types';

interface ServiceQuestionsStepProps {
  form: ServiceDraftPayload;
  onChange: (patch: Partial<ServiceDraftPayload>) => void;
}

export function ServiceQuestionsStep({ form, onChange }: ServiceQuestionsStepProps) {
  const questions = form.questions;
  const updateQuestion = (index: number, question: ServiceDraftQuestion) => onChange({ questions: questions.map((item, itemIndex) => itemIndex === index ? { ...question, sort_order: index } : item) });
  const removeQuestion = (index: number) => onChange({ questions: questions.filter((_, itemIndex) => itemIndex !== index).map((question, itemIndex) => ({ ...question, sort_order: itemIndex })) });
  const moveQuestion = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const next = [...questions];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange({ questions: next.map((question, itemIndex) => ({ ...question, sort_order: itemIndex })) });
  };
  return (
    <section className={styles.formCard} aria-labelledby="service-questions-title">
      <div>
        <p className={styles.eyebrow}>第二步 · 先問對問題，旅人才知道怎麼加入</p>
        <h2 id="service-questions-title" className="midao-heading">自訂問卷</h2>
        <p className={styles.description}>把出發前真的需要知道的事問清楚。問題會即時出現在右側預覽，也會自動存成草稿。</p>
      </div>
      <div className={styles.questionList}>
        {questions.map((question, index) => <QuestionEditor key={`${question.question_key}-${index}`} question={question} index={index} total={questions.length} onChange={(next) => updateQuestion(index, next)} onRemove={() => removeQuestion(index)} onMove={(direction) => moveQuestion(index, direction)} />)}
      </div>
      <button className={styles.secondaryButton} type="button" onClick={() => onChange({ questions: [...questions, createEmptyQuestion(questions.length)] })}>＋ 新增題目</button>
      <div>
        <h3 className="midao-heading">旅人看到的樣子</h3>
        <QuestionPreview questions={questions} />
      </div>
    </section>
  );
}
