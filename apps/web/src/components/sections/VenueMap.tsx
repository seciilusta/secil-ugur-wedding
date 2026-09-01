import { site } from "@/config/site";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Venue and map.
 *
 * Both Google Maps URLs start out empty in `site.ts`. Until they are filled in,
 * the map frame keeps its exact proportions and shows a quiet placeholder instead
 * of a broken iframe, and the directions link is left out rather than rendered
 * dead. Paste the two values into `site.maps` and this section completes itself.
 */
export function VenueMap() {
  const { venue, venueSection, maps } = site;

  const hasEmbed = maps.embedUrl.trim().length > 0;
  const hasDirections = maps.directionsUrl.trim().length > 0;

  return (
    <section id="mekan" className="band-venue py-section">
      <div className="shell">
        <div className="grid gap-10 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:gap-16">
          <Reveal y={0}>
            <p className="overline text-olive">{venueSection.overline}</p>
            <h2 className="mt-5 font-display text-heading text-charcoal no-orphan">{venueSection.heading}</h2>

            <address className="mt-6 text-body text-charcoal/80 not-italic text-pretty-tr">{venue.address}</address>

            {hasDirections ? (
              <a
                href={maps.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-target mt-7 inline-flex items-center gap-3 border-b border-charcoal/35 pb-1.5 text-fine font-medium tracking-label text-charcoal uppercase transition-colors duration-500 hover:border-charcoal hover:text-olive"
              >
                {venueSection.directionsLabel}
                <span aria-hidden>&#8599;</span>
              </a>
            ) : null}
          </Reveal>

          <Reveal delay={0.12}>
            {/* A restrained rectangular frame: one hairline, no shadow, minimal
                rounding, and the same 16:10 proportion whether or not the embed
                URL has been pasted in yet. */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-frame border border-warm-border bg-paper">
              {hasEmbed ? (
                <iframe
                  src={maps.embedUrl}
                  title={venueSection.mapTitle}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span aria-hidden className="mb-1 block h-8 w-px bg-champagne/70" />
                  <p className="text-body text-charcoal/70">{venueSection.mapPlaceholder}</p>
                  <p className="text-fine text-charcoal/45">{venueSection.mapPlaceholderHint}</p>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
