import { Navbar } from '../src/components/layout/Navbar';
import { Footer } from '../src/components/layout/Footer';
import { HeroSection } from '../src/components/home/HeroSection';
import { FeaturedTours } from '../src/components/home/FeaturedTours';
import { ThemeCtas } from '../src/components/home/ThemeCtas';
import { FaqSection } from '../src/components/home/FaqSection';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <FeaturedTours />
      <ThemeCtas />
      <FaqSection />
      <Footer />
    </>
  );
}
