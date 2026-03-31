import { HeroSection } from '../src/components/home/HeroSection';
import { FeaturedTours } from '../src/components/home/FeaturedTours';
import { DestinationsSection } from '../src/components/home/DestinationsSection';
import { GuideSpotlight } from '../src/components/home/GuideSpotlight';
import { ThemeCtas } from '../src/components/home/ThemeCtas';
import { FaqSection } from '../src/components/home/FaqSection';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <DestinationsSection />
      <FeaturedTours />
      <ThemeCtas />
      <GuideSpotlight />
      <FaqSection />
    </>
  );
}
