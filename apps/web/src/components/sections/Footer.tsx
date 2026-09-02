import { EntranceMotion } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function Footer() {
  const { couple, event, footer, venue } = site;

  return (
    <footer className="wedding-footer">
      <div className="shell">
        <div className="footer-grid">
          <EntranceMotion entrance="from-left">
            <p className="footer-names">
              {couple.brideFirstName}<i>&amp;</i>{couple.groomFirstName}
            </p>
            <p className="footer-closing">{footer.closing}</p>
          </EntranceMotion>

          <EntranceMotion entrance="from-right" delay={0.08} className="footer-meta">
            <time dateTime={event.isoDate}>{event.date}</time>
            <span>{venue.spaceName} · {venue.locationShort}</span>
          </EntranceMotion>
        </div>
      </div>
    </footer>
  );
}
