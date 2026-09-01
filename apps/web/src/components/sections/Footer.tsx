import { site } from "@/config/site";

/** The candlelit end of the page. Names, date, one closing line. Nothing else. */
export function Footer() {
  const { couple, event, footer } = site;

  return (
    <footer className="band-footer py-section-tight">
      <div className="shell">
        <hr className="rule w-full border-t-champagne/25" />

        <div className="mt-12 flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
          <p className="font-display text-detail tracking-wide text-ivory">
            {couple.brideFirstName}
            <span className="mx-[0.2em] text-champagne italic">&amp;</span>
            {couple.groomFirstName}
          </p>

          <p className="text-fine tracking-label text-on-dark-muted uppercase">
            <time dateTime={event.isoDate}>{event.date}</time>
          </p>
        </div>

        <p className="mt-10 max-w-[44ch] text-fine text-on-dark-muted text-pretty-tr">{footer.closing}</p>
      </div>
    </footer>
  );
}
