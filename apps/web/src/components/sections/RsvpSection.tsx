import { site } from "@/config/site";
import { Reveal } from "@/components/motion/Reveal";
import { RsvpForm } from "@/components/rsvp/RsvpForm";

/**
 * Where the page turns to evening.
 *
 * A dusk band above dissolves the warm beige into deep olive, so the shift reads
 * as the same page later in the day rather than as a new theme. `color-scheme:
 * dark` makes the native select and scrollbars match the section.
 */
export function RsvpSection() {
  const { rsvp } = site;

  return (
    <>
      {/* Beige giving way to olive. Purely a transition, holds no content. */}
      <div aria-hidden className="band-rsvp-dusk h-24 wide:h-32" />

      <section
        id="katilim"
        className="band-rsvp relative isolate overflow-hidden py-section"
        style={{ colorScheme: "dark" }}
      >
        {/* One candle, low and off to the side. Never behind the form controls. */}
        <div
          aria-hidden
          className="candle-glow pointer-events-none absolute right-[-8%] bottom-[-6rem] -z-10 h-[34rem] w-[34rem] opacity-40"
        />

        <div className="shell">
          <div className="grid gap-12 wide:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] wide:gap-20">
            <Reveal y={0}>
              <p className="overline text-champagne">{rsvp.overline}</p>
              <h2 className="mt-5 font-display text-heading text-on-olive no-orphan">{rsvp.heading}</h2>
              <p className="mt-6 max-w-[42ch] text-body text-on-olive-muted text-pretty-tr">{rsvp.intro}</p>
              <hr className="rule-on-olive mt-9 w-16 wide:mt-10" />
            </Reveal>

            {/* No entrance animation on the form itself: the RSVP must be
                available the moment the section is reachable. */}
            <div>
              <RsvpForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
