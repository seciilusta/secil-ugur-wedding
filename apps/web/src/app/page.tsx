import { Hero } from "@/components/sections/Hero";
import { Invitation } from "@/components/sections/Invitation";
import { EventDetails } from "@/components/sections/EventDetails";
import { VenueMap } from "@/components/sections/VenueMap";
import { RsvpSection } from "@/components/sections/RsvpSection";
import { Footer } from "@/components/sections/Footer";

/**
 * One page, read top to bottom: the invitation, when and where, and the RSVP.
 * Each section owns its own colour band, and together they carry the page from
 * ivory daylight down to a candlelit soft black.
 */
export default function Page() {
  return (
    <main>
      <Hero />
      <Invitation />
      <EventDetails />
      <VenueMap />
      <RsvpSection />
      <Footer />
    </main>
  );
}
