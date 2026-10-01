import PageWrapper from "@/components/Container/PageWrapper";
import { AccordionComponent } from "@/components/LandingPage/AccordionComponent";
import Footer from "@/components/LandingPage/Footer";
import HeroSection from "@/components/LandingPage/HeroSection";
import MarketingCards from "@/components/LandingPage/MarketingCards";
import PricingPage from "@/components/LandingPage/Pricing";

export default function Home() {
  return (
    <PageWrapper>
      <div className="mt-4 p-3">
        <HeroSection />
      </div>
      <div className="flex flex-col my-32 p-2 w-full justify-center items-center">
        <MarketingCards />
      </div>
      <div className="my-32">
        <PricingPage />
      </div>
      <div className="flex justify-center items-center w-full mt-20 mb-36">
        <AccordionComponent />
      </div>
      {/* <div className="w-full">
        <Footer />
      </div> */}
    </PageWrapper>
  );
}
