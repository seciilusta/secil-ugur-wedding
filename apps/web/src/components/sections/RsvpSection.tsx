import { EntranceMotion, LineDraw } from "@/components/motion/Choreography";
import { RsvpForm } from "@/components/rsvp/RsvpForm";
import { site } from "@/config/site";

export function RsvpSection() {
  const { rsvp } = site;

  return (
    <section id="katilim" className="rsvp-composition" style={{ colorScheme: "dark" }} aria-labelledby="rsvp-title">
      <div className="shell rsvp-grid">
        <div className="rsvp-heading">
          <EntranceMotion entrance="from-left">
            <p className="overline text-champagne">{rsvp.overline}</p>
            <LineDraw className="editorial-line editorial-line-dark" delay={0.1} />
          </EntranceMotion>

          <EntranceMotion entrance="quiet" delay={0.1}>
            <h2 id="rsvp-title">{rsvp.heading}</h2>
          </EntranceMotion>

          <EntranceMotion entrance="from-left" delay={0.2}>
            <p className="rsvp-intro">{rsvp.intro}</p>
          </EntranceMotion>
        </div>

        <EntranceMotion entrance="from-right" delay={0.08} className="rsvp-form-wrap">
          <RsvpForm />
        </EntranceMotion>
      </div>
    </section>
  );
}
