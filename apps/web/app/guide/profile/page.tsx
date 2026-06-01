'use client';

import { useState, useEffect } from 'react';

interface ProfileData {
  display_name: string;
  bio: string;
  region: string;
  languages: string[];
  specialties: string[];
  headline: string;
}

export default function GuideProfileEditPage() {
  const [profile, setProfile] = useState<ProfileData>({
    display_name: '',
    bio: '',
    region: '',
    languages: [],
    specialties: [],
    headline: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/guide/profile').then(r => r.json()),
      fetch('/api/guide/auth/csrf').then(r => r.json()),
    ]).then(([profileRes, csrfRes]) => {
      if (profileRes.ok) setProfile(profileRes.data);
      if (csrfRes.ok) setCsrfToken(csrfRes.data.csrfToken);
    }).catch(() => setMessage('載入失敗，請重新整理')).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/guide/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage('儲存成功！');
      } else {
        setMessage(`儲存失敗：${data.error?.message ?? '未知錯誤'}`);
      }
    } catch {
      setMessage('網路錯誤，請重試');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">載入中...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:p-8">
      <h1 className="text-2xl font-bold mb-6">編輯公開導遊頁面</h1>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="display_name">顯示名稱</label>
          <input
            id="display_name"
            type="text"
            required
            value={profile.display_name}
            onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="headline">一句話介紹</label>
          <input
            id="headline"
            type="text"
            value={profile.headline}
            onChange={e => setProfile(p => ({ ...p, headline: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="bio">個人介紹</label>
          <textarea
            id="bio"
            rows={5}
            value={profile.bio}
            onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="region">服務地區</label>
          <input
            id="region"
            type="text"
            value={profile.region}
            onChange={e => setProfile(p => ({ ...p, region: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="languages">語言（逗號分隔）</label>
          <input
            id="languages"
            type="text"
            value={profile.languages.join(', ')}
            onChange={e => setProfile(p => ({ ...p, languages: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="specialties">專長（逗號分隔）</label>
          <input
            id="specialties"
            type="text"
            value={profile.specialties.join(', ')}
            onChange={e => setProfile(p => ({ ...p, specialties: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="bg-violet-600 text-white px-6 py-2 rounded hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </form>
    </div>
  );
}
