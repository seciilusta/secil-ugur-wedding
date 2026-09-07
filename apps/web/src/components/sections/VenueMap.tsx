import { EntranceMotion } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function VenueMap() {
  const { venue, venueSection, maps, artwork } = site;
  const hasDirections = maps.directionsUrl.trim().length > 0;

  return (
    <section id="mekan" className="venue-composition" aria-labelledby="venue-title">
      <div className="shell venue-grid">
        <EntranceMotion entrance="from-left" className="venue-copy">
          <p className="overline text-olive">{venueSection.overline}</p>
          <p className="venue-space">{venueSection.spaceLabel}</p>
          <h2 id="venue-title">{venueSection.heading}</h2>
          <address>{venue.address}</address>

          {hasDirections ? (
            <a className="venue-directions" href={maps.directionsUrl} target="_blank" rel="noopener noreferrer">
              {venueSection.directionsLabel}<span aria-hidden>↗</span>
            </a>
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
