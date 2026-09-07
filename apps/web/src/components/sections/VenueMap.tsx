import { EntranceMotion, LineDraw } from "@/components/motion/Choreography";
import { site } from "@/config/site";
import { VenueDirections } from "./VenueDirections";

export function VenueMap() {
  const { venue, venueSection, maps, artwork } = site;
  const hasDirections = maps.directionsUrl.trim().length > 0;

  return (
    <section id="mekan" className="venue-composition" aria-labelledby="venue-title">
      <div className="shell venue-grid">
        <EntranceMotion entrance="from-left" className="venue-copy">
          <p className="section-kicker text-olive">{venueSection.overline}</p>
          <LineDraw className="editorial-line section-kicker-line" delay={0.1} />
          <p className="venue-space">{venueSection.spaceLabel}</p>
          <h2 id="venue-title">{venueSection.heading}</h2>
          <LineDraw className="editorial-line section-title-line" delay={0.12} />
          <address>{venue.address}</address>

          {hasDirections ? (
            <VenueDirections
              href={maps.directionsUrl}
              mobileHref={maps.mobileDirectionsUrl}
              label={venueSection.directionsLabel}
            />
          ) : null}
        </EntranceMotion>

        <div className="venue-visual">
          <EntranceMotion entrance="soft-scale" className="venue-art-crop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artwork.venueDetail.src}
              width={artwork.venueDetail.width}
              height={artwork.venueDetail.height}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </EntranceMotion>
        </div>
      </div>
    </section>
  );
}
