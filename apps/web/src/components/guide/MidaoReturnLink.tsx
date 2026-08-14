'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { safeMidaoReturnPath } from '../../lib/midao/legacy-entry';

const PURPLE = '#7c3aed';
const PURPLE_SOFT = '#f5f3ff';

/**
 * 供既有 /guide/profile 頁面在受控 Midao legacy-entry 導流時顯示的「返回祕島」連結。
 * 自行讀取 searchParams 並經 shared validator 判定安全後才渲染；
 * 純呈現層元件，不涉及 session/ownership/mutation 邏輯。
 */
export default function MidaoReturnLink() {
  const searchParams = useSearchParams();
  const returnTo = safeMidaoReturnPath(searchParams.get('returnTo'));
  if (!returnTo) return null;
  return (
    <Link
      href={returnTo}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '7px 12px', fontSize: 13, fontWeight: 600,
        borderRadius: 8, border: '1px solid #ddd6fe',
        background: PURPLE_SOFT, color: PURPLE, textDecoration: 'none',
      }}
    >
      ← 返回祕島
    </Link>
  );
}
