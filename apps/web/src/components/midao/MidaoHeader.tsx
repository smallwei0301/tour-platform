import MidaoLogo from './MidaoLogo';
import MidaoIcon from './MidaoIcon';

export default function MidaoHeader() {
  return (
    <header className="midao-header">
      <div className="midao-brand">
        <MidaoLogo />
        <div className="midao-brand-text">
          <h1 className="midao-brand-title">祕島</h1>
          <p className="midao-brand-subtitle">MIDAO · SECRET ISLE</p>
        </div>
      </div>

      <div className="midao-header-actions">
        <button className="icon-button" aria-label="搜尋" type="button">
          <MidaoIcon name="search" size={22} />
        </button>
        <button className="icon-button" aria-label="選單" type="button">
          <MidaoIcon name="menu" size={22} />
        </button>
      </div>
    </header>
  );
}
