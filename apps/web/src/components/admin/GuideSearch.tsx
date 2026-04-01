'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface GuideOption {
  id: string;
  slug: string;
  displayName: string;
  verificationStatus?: string;
  profilePhotoUrl?: string;
}

interface GuideSearchProps {
  value: string;
  onChange: (slug: string, displayName: string) => void;
  style?: React.CSSProperties;
}

export function GuideSearch({ value, onChange, style }: GuideSearchProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<GuideOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial display name if value is pre-filled
  useEffect(() => {
    if (value && !selectedName) {
      fetch(`/api/admin/guides/search?q=${encodeURIComponent(value)}`)
        .then(r => r.json())
        .then(json => {
          const found = (json.data || []).find((g: GuideOption) => g.slug === value);
          if (found) setSelectedName(found.displayName);
        })
        .catch(() => {});
    }
    if (!value) setSelectedName('');
  }, [value]);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/guides/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setOptions(json.data || []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    search(q);
    // Clear selection if user starts typing
    if (value) onChange('', '');
  }

  function handleFocus() {
    setOpen(true);
    if (!options.length) search(query);
  }

  function handleSelect(g: GuideOption) {
    setSelectedName(g.displayName);
    setQuery('');
    setOpen(false);
    onChange(g.slug, g.displayName);
  }

  function handleClear() {
    setSelectedName('');
    setQuery('');
    setOpen(false);
    onChange('', '');
  }

  const fieldStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 12px',
    border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
    ...style,
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {value && selectedName ? (
        // Show selected guide as tag
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8,
          background: '#f0fdf4', fontSize: 14,
        }}>
          <span style={{ fontWeight: 600, color: '#166534', flex: 1 }}>
            ✅ {selectedName}
            <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 8, fontSize: 12 }}>
              ({value})
            </span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', fontSize: 16, padding: 2,
            }}
            title="清除"
          >✕</button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="搜尋導遊名稱或 slug…"
          style={fieldStyle}
          autoComplete="off"
        />
      )}

      {open && !value && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 300, overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: 13 }}>搜尋中⋯</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: 13 }}>查無導遊</div>
          )}
          {!loading && options.map(g => (
            <div
              key={g.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(g)}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 10, fontSize: 14,
                borderBottom: '1px solid #f3f4f6',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {g.profilePhotoUrl ? (
                <img src={g.profilePhotoUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                  {g.displayName?.[0] || '?'}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 600 }}>{g.displayName}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {g.slug}
                  {g.verificationStatus === 'approved' && (
                    <span style={{ marginLeft: 6, color: '#16a34a' }}>✓ 已認證</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
