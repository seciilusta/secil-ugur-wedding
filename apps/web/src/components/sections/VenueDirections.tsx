"use client";

import type { MouseEvent } from "react";

type VenueDirectionsProps = {
  href: string;
  mobileHref: string;
  label: string;
};

/**
 * On phones, a geo: URL is handed to the operating system so it can offer
 * the map apps installed by the guest. Desktop browsers keep the regular web
 * directions link.
 */
export function VenueDirections({ href, mobileHref, label }: VenueDirectionsProps) {
  function openDirections(event: MouseEvent<HTMLAnchorElement>) {
    if (/Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)) {
      event.preventDefault();
      window.location.href = mobileHref;
    }
  }

  return (
    <a className="venue-directions" href={href} onClick={openDirections} target="_blank" rel="noopener noreferrer">
      {label}<span aria-hidden>↗</span>
    </a>
  );
}
