"use client";

import { useRef } from "react";
import type { MouseEvent } from "react";

type VenueDirectionsProps = {
  href: string;
  label: string;
  appLinks: {
    appleMaps: string;
    googleMaps: string;
    waze: string;
  };
};

/**
 * Phones and narrow browser emulators get an explicit app chooser with valid
 * universal links. Desktop browsers keep the regular web directions link.
 */
export function VenueDirections({ href, label, appLinks }: VenueDirectionsProps) {
  const chooserRef = useRef<HTMLDialogElement>(null);

  function openDirections(event: MouseEvent<HTMLAnchorElement>) {
    if (window.matchMedia("(max-width: 48rem)").matches || window.navigator.maxTouchPoints > 1) {
      event.preventDefault();
      chooserRef.current?.showModal();
    }
  }

  function closeChooser() {
    chooserRef.current?.close();
  }

  return (
    <>
      <a className="venue-directions" href={href} onClick={openDirections} target="_blank" rel="noopener noreferrer">
        {label}<span aria-hidden>↗</span>
      </a>

      <dialog
        ref={chooserRef}
        className="venue-map-chooser"
        aria-labelledby="venue-map-chooser-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeChooser();
        }}
      >
        <div className="venue-map-chooser-panel">
          <button className="venue-map-chooser-close" type="button" onClick={closeChooser} aria-label="Kapat">
            ×
          </button>
          <p className="venue-map-chooser-kicker">Yol Tarifi</p>
          <h3 id="venue-map-chooser-title">Harita uygulamasını seçin</h3>
          <div className="venue-map-apps">
            <a href={appLinks.appleMaps} target="_blank" rel="noopener noreferrer" onClick={closeChooser}>
              Apple Haritalar <span aria-hidden>↗</span>
            </a>
            <a href={appLinks.googleMaps} target="_blank" rel="noopener noreferrer" onClick={closeChooser}>
              Google Maps <span aria-hidden>↗</span>
            </a>
            <a href={appLinks.waze} target="_blank" rel="noopener noreferrer" onClick={closeChooser}>
              Waze <span aria-hidden>↗</span>
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
