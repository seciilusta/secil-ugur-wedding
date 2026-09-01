import { site } from "@/config/site";
import { Reveal } from "@/components/motion/Reveal";

/**
 * The invitation line, set as typography in the composition itself — no quote
 * card, no border, no centred block. The overline sits in a narrow left-hand
 * column so the sentence starts off-centre.
 */
export function Invitation() {
  const { invitation } = site;

  return (
    <section id="davet" className="band-invitation py-section">
      <div className="shell">
        <div className="grid gap-8 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-12 wide:grid-cols-[12rem_minmax(0,1fr)]">
          <Reveal y={0} className="md:pt-3">
            <p className="overline text-olive">{invitation.overline}</p>
            <hr className="rule mt-4 w-10 md:mt-5" />
          </Reveal>

          <Reveal delay={0.14}>
            {/* The measure lives on the paragraph, not the wrapper: `ch` has to
                resolve against Bodoni at the quote size, otherwise it inherits
                the much narrower body font and the sentence sets in a thin
                column. */}
            <p className="font-display text-quote text-charcoal text-pretty-tr max-w-[34ch]">
              {invitation.body}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
