import { Hero } from "@/components/sections/Hero";
import { Invitation } from "@/components/sections/Invitation";
import { EventDetails } from "@/components/sections/EventDetails";
import { VenueMap } from "@/components/sections/VenueMap";
import { RsvpSection } from "@/components/sections/RsvpSection";
import { Footer } from "@/components/sections/Footer";
import { BotanicalDrift } from "@/components/motion/Choreography";
import { site } from "@/config/site";

/**
 * One continuous invitation with two environmental states. Semantic sections
 * keep their navigation and accessibility boundaries, while the shared light
 * and evening canvases own the page background independently of those bounds.
 */
export default function Page() {
  return (
    <main className="page-canvas">
      <div className="light-experience">
        <Hero />
        <Invitation />
        <EventDetails />
        <VenueMap />
      </div>

      <div className="evening-experience">
        <BotanicalDrift className="evening-botanical evening-botanical-upper" direction={-1}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.artwork.botanical} alt="" width="900" height="1350" loading="lazy" decoding="async" />
        </BotanicalDrift>
        <BotanicalDrift className="evening-botanical evening-botanical-lower" direction={1}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.artwork.botanical} alt="" width="900" height="1350" loading="lazy" decoding="async" />
        </BotanicalDrift>
        <RsvpSection />
        <Footer />
      </div>
    </main>
  );
}
