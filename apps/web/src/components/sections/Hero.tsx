import Link from "next/link";

import { Countdown } from "@/components/hero/Countdown";
import { HeaderTone } from "@/components/hero/HeaderTone";
import { BotanicalDrift, EntranceMotion } from "@/components/motion/Choreography";
import { site } from "@/config/site";

export function HeroHeader() {
  const { couple, event, hero } = site;

  return (
    <header className="hero-topbar">
      <HeaderTone />
      <EntranceMotion entrance="from-left" trigger="mount" className="hero-monogram">
        <Link href="/" aria-label={`${couple.combined} ana sayfa`}>
          {couple.monogram}
        </Link>
      </EntranceMotion>

      <EntranceMotion entrance="hero-nav" trigger="mount" delay={0.06}>
        <nav aria-label="Sayfa bölümleri" className="hero-nav">
          <a href="#davet">{hero.navigation.invitation}</a>
          <a href="#program">{hero.navigation.weddingDay}</a>
          <a href="#mekan">{hero.navigation.venue}</a>
          <a href="#katilim">{hero.navigation.rsvp}</a>
        </nav>
      </EntranceMotion>

      <EntranceMotion entrance="from-right" trigger="mount" delay={0.12} className="hero-header-date">
        <time dateTime={event.isoDate} aria-label={event.date}>
          {event.shortDate}
        </time>
      </EntranceMotion>
    </header>
  );
}

export function Hero() {
  const { couple, event, venue, hero, artwork } = site;
  const [eventDay, eventMonth, eventYear] = event.date.split(" ");

  return (
    <section className="hero-artwork" aria-labelledby="hero-title">
      <div aria-hidden className="hero-paper" />
      <div aria-hidden className="hero-light" />

      <EntranceMotion entrance="soft-scale" trigger="mount" delay={0.05} className="hero-venue-art">
        {/* Keep both art-directed crops mounted so crossing a responsive
            boundary can cross-fade instead of replacing the image in one frame. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hero-venue-image hero-venue-image-desktop"
          src={artwork.heroDesktop.src}
          width={artwork.heroDesktop.width}
          height={artwork.heroDesktop.height}
          alt=""
          fetchPriority="high"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hero-venue-image hero-venue-image-mobile"
          src={artwork.heroMobile.src}
          width={artwork.heroMobile.width}
          height={artwork.heroMobile.height}
          alt=""
          decoding="async"
        />
      </EntranceMotion>

      <BotanicalDrift className="hero-botanical hero-botanical-left" direction={-1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artwork.botanical} alt={artwork.botanicalAlt} width="900" height="1350" decoding="async" />
      </BotanicalDrift>
      <div className="hero-shell">
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
        </div>

        <EntranceMotion entrance="quiet" trigger="mount" delay={0.58} className="hero-vertical-date">
          <time aria-hidden="true" dateTime={event.isoDate}>
            <span>{eventDay.padStart(2, "0")}</span>
            <span>{eventMonth}</span>
            <span>{eventYear}</span>
          </time>
          <span aria-hidden="true" className="hero-vertical-date-line" />
        </EntranceMotion>

        <div className="hero-countdown-band">
          <BotanicalDrift className="hero-countdown-botanical" direction={1}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artwork.botanical} alt={artwork.botanicalAlt} width="900" height="1350" decoding="async" />
          </BotanicalDrift>

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
      </div>
    </section>
  );
}
