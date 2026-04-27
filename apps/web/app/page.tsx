import type { Metadata } from 'next';
import MidaoMobileHome from '../src/components/midao/MidaoMobileHome';

export const metadata: Metadata = {
  title: '祕島 MIDAO｜手機版首頁',
  description: '祕境不會自己出現。要有人帶你去。以高級編輯感重新呈現台灣在地探索首頁。',
};

export default function HomePage() {
  return <MidaoMobileHome />;
}
