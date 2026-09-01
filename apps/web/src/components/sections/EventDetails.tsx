import { site } from "@/config/site";
import { Reveal } from "@/components/motion/Reveal";

/**
 * When and where, as a fine typographic list rather than a timeline component.
 * Asymmetric on desktop: the heading holds the narrow left column, the rows run
 * across the wider right one with hairlines between them.
 */
export function EventDetails() {
  const { event, venue, eventDetails } = site;

  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Tarih", value: `${event.date}, ${event.day}`, emphasis: true },
    { label: event.startLabel, value: event.startTime, emphasis: true },
    { label: event.ceremonyLabel, value: event.ceremonyTime, emphasis: true },
    { label: "Mekân", value: venue.name },
    { label: "Konum", value: venue.location },
  ];

  return (
    <section id="program" className="band-event py-section">
      <div className="shell">
        <div className="grid gap-10 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:gap-16">
          <Reveal y={0}>
            <p className="overline text-olive">{eventDetails.overline}</p>
            <h2 className="mt-5 font-display text-heading text-charcoal no-orphan">{eventDetails.heading}</h2>
          </Reveal>

          <Reveal delay={0.12}>
            <dl className="border-t border-warm-border">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-warm-border py-5"
                >
                  <dt className="text-fine tracking-label text-charcoal/60 uppercase">{row.label}</dt>
                  <dd
                    className={
                      row.emphasis
                        ? "font-display text-detail text-charcoal"
                        : "text-body text-charcoal/85 text-pretty-tr"
                    }
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
