import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

/**
 * Both families are loaded with the latin-ext subset, which is what carries the
 * Turkish ğ, ş and dotless ı. Without it those characters fall back to a
 * different font mid-word.
 */
const bodoni = Bodoni_Moda({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-bodoni",
});

const jost = Jost({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-jost",
});

export const metadata: Metadata = {
  title: site.metadata.title,
  description: site.metadata.description,
  keywords: [...site.metadata.keywords],
  applicationName: site.couple.combined,
  authors: [{ name: site.couple.combined }],
  openGraph: {
    type: "website",
    locale: site.metadata.locale,
    siteName: site.couple.combined,
    title: site.share.ogTitle,
    description: site.share.ogDescription,
    images: [
      {
        url: site.share.ogImage,
        width: 1200,
        height: 630,
        alt: site.share.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: site.share.ogTitle,
    description: site.share.ogDescription,
    images: [site.share.ogImage],
  },
  robots: { index: true, follow: true },
  /**
   * Open Graph image URLs have to be absolute, so a base is always needed. Until
   * `site.share.siteUrl` is filled in, the reserved `.example` TLD stands in — an
   * obviously unusable placeholder is easier to spot in a preview than a
   * plausible-looking wrong domain.
   */
  metadataBase: new URL(site.share.siteUrl || "https://secil-ugur-wedding.example"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Guests must always be able to zoom in on the address and the times.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: site.theme.lightThemeColor },
    { media: "(prefers-color-scheme: dark)", color: site.theme.darkThemeColor },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${bodoni.variable} ${jost.variable}`}>
      <body>
        {/*
          Scroll-revealed sections are prerendered with an inline `opacity: 0`
          that the animation library clears once it hydrates. Without
          JavaScript nothing would ever clear it, so the invitation, the event
          details and the RSVP heading would be invisible. This puts them back.
        */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important;clip-path:none !important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
