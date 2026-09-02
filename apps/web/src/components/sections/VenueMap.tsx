import { EntranceMotion, LineDraw } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function VenueMap() {
  const { venue, venueSection, maps, artwork } = site;
  const hasEmbed = maps.embedUrl.trim().length > 0;
  const hasDirections = maps.directionsUrl.trim().length > 0;

  return (
    <section id="mekan" className="venue-composition" aria-labelledby="venue-title">
      <EntranceMotion entrance="soft-scale" className="venue-art-crop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artwork.illustration}
          srcSet={artwork.illustrationSrcSet}
          sizes="(min-width: 48rem) 62vw, 135vw"
          width={artwork.illustrationWidth}
          height={artwork.illustrationHeight}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </EntranceMotion>

      <div className="shell venue-grid">
        <EntranceMotion entrance="from-left" className="venue-copy">
          <p className="overline text-olive">{venueSection.overline}</p>
          <LineDraw className="editorial-line" delay={0.1} />
          <p className="venue-space">{venueSection.spaceLabel}</p>
          <h2 id="venue-title">{venueSection.heading}</h2>
          <address>{venue.address}</address>

          {hasDirections ? (
            <a className="venue-directions" href={maps.directionsUrl} target="_blank" rel="noopener noreferrer">
              {venueSection.directionsLabel}<span aria-hidden>↗</span>
            </a>
          ) : null}
        </EntranceMotion>

        <EntranceMotion entrance="from-right" delay={0.14} className="venue-map-wrap">
          <div className="venue-map">
            {hasEmbed ? (
              <iframe
                src={maps.embedUrl}
                title={venueSection.mapTitle}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : (
              <div className="venue-map-placeholder">
                <span aria-hidden />
                <p>{venueSection.mapPlaceholder}</p>
                <small>{venueSection.mapPlaceholderHint}</small>
              </div>
            )}
          </div>
        </EntranceMotion>
      </div>
    </section>
  );
}
