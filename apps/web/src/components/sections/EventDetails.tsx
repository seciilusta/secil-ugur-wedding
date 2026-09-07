import { EntranceMotion, LineDraw } from "@/components/motion/Choreography";
import { WeddingTimeline } from "@/components/timeline/WeddingTimeline";
import { site } from "@/config/site";

export function EventDetails() {
  const { event, eventDetails } = site;

  return (
    <section id="program" className="wedding-day" aria-labelledby="wedding-day-title">
      <div className="shell wedding-day-grid">
        <div className="wedding-day-heading">
          <EntranceMotion entrance="from-left">
            <p className="section-kicker text-olive">{eventDetails.overline}</p>
            <LineDraw className="editorial-line section-kicker-line" delay={0.1} />
          </EntranceMotion>

          <EntranceMotion entrance="quiet" delay={0.1}>
            <p className="wedding-day-date" aria-hidden>
              <span>04</span>
              <span>Ekim</span>
              <span>2026</span>
            </p>
          </EntranceMotion>

          <EntranceMotion entrance="from-left" delay={0.18}>
            <h2 id="wedding-day-title">{eventDetails.heading}</h2>
            <LineDraw className="editorial-line section-title-line" delay={0.22} />
            <p className="wedding-day-intro">{eventDetails.intro}</p>
            <p className="sr-only">{event.date}, {event.day}</p>
          </EntranceMotion>
        </div>

        <EntranceMotion entrance="from-right" delay={0.08} className="wedding-day-program">
          <WeddingTimeline />
        </EntranceMotion>
      </div>
    </section>
  );
}
