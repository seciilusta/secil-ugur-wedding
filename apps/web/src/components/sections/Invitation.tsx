import { BotanicalDrift, EntranceMotion, LineDraw } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function Invitation() {
  const { invitation, artwork } = site;

  return (
    <section id="davet" className="invitation-composition" aria-labelledby="invitation-title">
      <BotanicalDrift className="invitation-botanical" direction={1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artwork.botanical} alt="" width="900" height="1350" loading="lazy" decoding="async" />
      </BotanicalDrift>

      <div className="shell invitation-grid">
        <EntranceMotion entrance="from-left" className="invitation-label">
          <p className="section-kicker text-olive">{invitation.overline}</p>
          <LineDraw className="editorial-line section-kicker-line" delay={0.12} />
        </EntranceMotion>

        <EntranceMotion entrance="from-right" delay={0.1} className="invitation-copy">
          <p id="invitation-title">{invitation.body}</p>
        </EntranceMotion>

        <EntranceMotion entrance="quiet" delay={0.26} className="invitation-monogram">
          <span aria-hidden>{site.couple.monogram}</span>
        </EntranceMotion>
      </div>
    </section>
  );
}
