import { Countdown } from "@/components/hero/Countdown";
import { BotanicalDrift, EntranceMotion } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function Hero() {
  const { couple, event, venue, hero, artwork } = site;

  return (
    <section className="hero-artwork" aria-labelledby="hero-title">
      <div aria-hidden className="hero-paper" />
      <div aria-hidden className="hero-light" />

      <EntranceMotion entrance="soft-scale" trigger="mount" delay={0.05} className="hero-venue-art">
        <picture>
          <source media="(max-width: 69.999rem)" srcSet={artwork.heroMobile.src} />
          <img
            src={artwork.heroDesktop.src}
            width={artwork.heroDesktop.width}
            height={artwork.heroDesktop.height}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </EntranceMotion>

      <BotanicalDrift className="hero-botanical hero-botanical-left" direction={-1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artwork.botanical} alt={artwork.botanicalAlt} width="900" height="1350" decoding="async" />
      </BotanicalDrift>
      <BotanicalDrift className="hero-botanical hero-botanical-right" direction={1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artwork.botanical} alt={artwork.botanicalAlt} width="900" height="1350" decoding="async" />
      </BotanicalDrift>

      <div className="hero-shell">
        <header className="hero-topbar">
          <EntranceMotion entrance="from-left" trigger="mount" className="hero-monogram">
            <a href="#davet" aria-label={`${couple.combined} davetiyesi`}>
              {couple.monogram}
            </a>
          </EntranceMotion>

          <EntranceMotion entrance="hero-meta" trigger="mount" delay={0.12}>
            <nav aria-label="Sayfa bölümleri" className="hero-nav">
              <a href="#davet">{hero.navigation.invitation}</a>
              <a href="#program">{hero.navigation.weddingDay}</a>
              <a href="#mekan">{hero.navigation.venue}</a>
              <a href="#katilim">{hero.navigation.rsvp}</a>
            </nav>
          </EntranceMotion>
        </header>

        <div className="hero-copy">
          <EntranceMotion entrance="from-left" trigger="mount" delay={0.12}>
            <p className="hero-overline">{hero.overline}</p>
          </EntranceMotion>

          <EntranceMotion entrance="hero-title" trigger="mount" delay={0.22}>
            <h1 id="hero-title" className="hero-title">
              <span>{couple.brideFirstName}</span>
              <i>&amp;</i>
              <span>{couple.groomFirstName}</span>
            </h1>
          </EntranceMotion>
        </div>

        <EntranceMotion entrance="hero-meta" trigger="mount" delay={0.38} className="hero-details">
          <p className="hero-date">
            <time dateTime={event.isoDate}>{event.date}</time>
            <span>{event.day}</span>
          </p>
          <p className="hero-place">
            <span>{venue.name}</span>
            <span>{venue.spaceName} · {venue.locationShort}</span>
          </p>
        </EntranceMotion>

        <EntranceMotion entrance="quiet" trigger="mount" delay={0.52} className="hero-countdown">
          <p className="hero-countdown-overline">{hero.countdown.overline}</p>
          <Countdown />
        </EntranceMotion>

        <EntranceMotion entrance="quiet" trigger="mount" delay={0.7} className="hero-scroll">
          <a href="#davet">
            <span>{hero.scrollHint}</span>
            <span aria-hidden className="hero-scroll-line" />
          </a>
        </EntranceMotion>
      </div>
    </section>
  );
}
