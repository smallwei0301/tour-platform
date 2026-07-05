'use client';

// #1615 第一批：guide／admin「新增/編輯休假時段」Modal 內的表單欄位。
// 純結構搬移——JSX 與文案與原頁面逐字相同；input id 由頁面注入
//（guide＝avail-blackout-*、admin＝admin-avail-blackout-*）。

export type BlackoutFormValues = {
  starts_at: string;
  ends_at: string;
  reason: string;
};

export type BlackoutFieldIds = {
  startsAt: string;
  endsAt: string;
  reason: string;
};

export function BlackoutFields({
  blackoutForm,
  ids,
  onPatch,
}: {
  blackoutForm: BlackoutFormValues;
  ids: BlackoutFieldIds;
  onPatch: (patch: Partial<BlackoutFormValues>) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={ids.startsAt} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
        <input
          id={ids.startsAt}
          type="datetime-local"
          value={blackoutForm.starts_at}
          onChange={(e) => onPatch({ starts_at: e.target.value })}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label htmlFor={ids.endsAt} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
        <input
          id={ids.endsAt}
          type="datetime-local"
          value={blackoutForm.ends_at}
          onChange={(e) => onPatch({ ends_at: e.target.value })}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label htmlFor={ids.reason} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>原因 (選填)</label>
        <input
          id={ids.reason}
          type="text"
          value={blackoutForm.reason}
          onChange={(e) => onPatch({ reason: e.target.value })}
          placeholder="例：私人行程"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
    </>
  );
}
