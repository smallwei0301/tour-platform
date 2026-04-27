import MidaoHeader from './MidaoHeader';
import MidaoHero from './MidaoHero';
import MidaoSearchPanel from './MidaoSearchPanel';
import MidaoFieldNotes from './MidaoFieldNotes';
import MidaoBottomNav from './MidaoBottomNav';

export default function MidaoMobileHome() {
  return (
    <main className="midao-app">
      <MidaoHeader />
      <MidaoHero />
      <MidaoSearchPanel />
      <MidaoFieldNotes />
      <MidaoBottomNav />
    </main>
  );
}
