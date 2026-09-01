import { site } from "@/config/site";
import { IllustrationReveal } from "@/components/motion/IllustrationReveal";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Opening screen.
 *
 * Mobile builds a straight vertical hierarchy — overline, names, details, CTA,
 * then the illustration in the lower part of the screen. From `wide` upwards the
 * same content becomes an asymmetric composition: the text grouping sits in the
 * upper left and the illustration anchors the lower right, leaving the upper
 * right as calm negative space.
 */
export function Hero() {
  const { couple, event, venue, hero, artwork } = site;

  return (
    <section className="band-hero relative isolate overflow-hidden">
      {/* Warm daylight pooling behind the names. Decorative, never over content. */}
      <div
        aria-hidden
        className="candle-glow pointer-events-none absolute -top-40 left-[-10%] -z-10 h-[42rem] w-[42rem] opacity-[0.35]"
      />

      <div className="shell hero-viewport relative flex flex-col justify-between gap-stack pt-24 pb-10 wide:block wide:pt-32 wide:pb-0">
        {/* ---------------------------------------------------------- text */}
        <div className="wide:max-w-[42%]">
          <Reveal as="p" trigger="mount" delay={0.05} y={10} className="overline text-olive">
            {hero.overline}
          </Reveal>

          <Reveal as="h1" trigger="mount" delay={0.18} className="mt-5 wide:mt-7">
            <span className="block font-display text-names tracking-names text-charcoal no-orphan">
              {couple.brideFirstName}
              <span className="mx-[0.18em] font-normal text-champagne italic">&amp;</span>
              {couple.groomFirstName}
            </span>
          </Reveal>

          <Reveal trigger="mount" delay={0.34} y={0} className="mt-7 wide:mt-9">
            <hr className="rule w-16" />
          </Reveal>

          <Reveal as="dl" trigger="mount" delay={0.46} className="mt-6 space-y-2 wide:mt-7">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="sr-only">Tarih</dt>
              <dd className="font-display text-detail text-charcoal">
                <time dateTime={event.isoDate}>
                  {event.date} · {event.day}
                </time>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="sr-only">Saat</dt>
              <dd className="text-body tracking-wide text-charcoal/80">{event.startTime}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="sr-only">Mekân</dt>
              <dd className="text-body text-charcoal/80 text-pretty-tr">
                {venue.name} · {venue.locationShort}
              </dd>
            </div>
          </Reveal>

          <Reveal trigger="mount" delay={0.62} className="mt-9 wide:mt-11">
            <a
              href="#katilim"
              className="tap-target group inline-flex items-center justify-center rounded-frame border border-charcoal/45 px-8 py-3.5 text-fine font-medium tracking-label text-charcoal uppercase transition-colors duration-500 hover:border-charcoal hover:bg-charcoal hover:text-ivory focus-visible:bg-charcoal focus-visible:text-ivory active:bg-charcoal active:text-ivory"
            >
              {hero.ctaLabel}
            </a>
          </Reveal>
        </div>

        {/* -------------------------------------------------- illustration */}
        <IllustrationReveal
          className={[
            // Mobile: lower part of the hero, capped so it always fits a short screen.
            "mt-6 flex w-full justify-center",
            // Desktop: bottom-right anchor, bleeding a little past the content gutter.
            "wide:absolute wide:right-[calc(var(--spacing-gutter)*-0.35)] wide:bottom-0 wide:mt-0 wide:w-[52%] wide:max-w-[42rem]",
          ].join(" ")}
        >
          {/* A plain <img> on purpose. This is a static export, so next/image
              runs unoptimized and would emit a single src — it cannot serve the
              srcset ladder that keeps the illustration sharp on high-density
              screens without shipping a 200 KB file to every phone. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artwork.illustration}
            srcSet={artwork.illustrationSrcSet}
            sizes="(min-width: 70rem) 46vw, 94vw"
            width={artwork.illustrationWidth}
            height={artwork.illustrationHeight}
            alt={artwork.illustrationAlt}
            fetchPriority="high"
            decoding="async"
            /* Intrinsic ratio plus a height cap: the illustration keeps its
               proportions, never shifts layout, and never grows tall enough to
               crowd the text out of a short phone screen. */
            className="h-auto w-full max-h-[32svh] object-contain object-bottom wide:max-h-none"
            style={{ aspectRatio: `${artwork.illustrationWidth} / ${artwork.illustrationHeight}` }}
          />
        </IllustrationReveal>

        {/* ---------------------------------------------- scroll indicator */}
        <div className="flex justify-center wide:absolute wide:bottom-12 wide:left-[var(--spacing-gutter)] wide:justify-start">
          <a
            href="#davet"
            className="tap-target group flex flex-col items-center gap-3 pt-2 wide:flex-row wide:items-center wide:gap-4"
          >
            <span className="text-overline tracking-overline text-charcoal/55 uppercase transition-colors group-hover:text-charcoal">
              {hero.scrollHint}
            </span>
            <span
              aria-hidden
              className="hairline-pulse-y h-10 w-px origin-top bg-charcoal/30 wide:hairline-pulse-x wide:h-px wide:w-12 wide:origin-left"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
