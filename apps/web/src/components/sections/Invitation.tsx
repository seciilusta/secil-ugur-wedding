import Image from "next/image";
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
        <div className="invitation-text">
          <EntranceMotion entrance="from-left" className="invitation-label">
            <p className="section-kicker text-olive">{invitation.overline}</p>
            <LineDraw className="editorial-line section-kicker-line" delay={0.12} />
          </EntranceMotion>

          <EntranceMotion entrance="from-left" delay={0.1} className="invitation-copy">
            <p id="invitation-title">{invitation.body}</p>
          </EntranceMotion>

          <EntranceMotion entrance="quiet" delay={0.26} className="invitation-monogram">
            <span aria-hidden>{site.couple.monogram}</span>
          </EntranceMotion>
        </div>

        <EntranceMotion entrance="from-right" delay={0.16} className="invitation-portrait">
          <Image
            src={artwork.couplePortrait.src}
            alt={artwork.couplePortrait.alt}
            width={artwork.couplePortrait.width}
            height={artwork.couplePortrait.height}
            sizes="(max-width: 991px) min(86vw, 420px), (max-width: 1280px) 36vw, 440px"
          />
        </EntranceMotion>
      </div>
    </section>
  );
}
