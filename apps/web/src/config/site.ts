/**
 * Every editable piece of wedding information and website copy lives here.
 *
 * This is the only file you need to touch to change what the website says.
 * Deployment secrets live in the hosting environment and never in this file.
 *
 * Colours, typography and spacing live in `src/app/globals.css`.
 */

export const site = {
  /* ---------------------------------------------------------------- couple */

  couple: {
    /** Rendered as the main heading. Kept as separate parts so the ampersand can be styled. */
    brideFirstName: "Seçil",
    groomFirstName: "Uğur",
    /** Used in metadata, the footer and social sharing. */
    combined: "Seçil & Uğur",
    /** Favicon / monogram initials. */
    monogram: "S&U",
  },

  /* ----------------------------------------------------------------- event */

  event: {
    /** Human-readable date, exactly as it should appear on the page. */
    date: "4 Ekim 2026",
    /** Day of the week. */
    day: "Pazar",
    /** Machine-readable date for <time datetime="…">. */
    isoDate: "2026-10-04",
    /** When guests should arrive. */
    startTime: "18.30",
    /** When the official ceremony begins. */
    ceremonyTime: "19.30",
    /** Labels for the two times, so they stay editable too. */
    startLabel: "Düğün Başlangıcı",
    ceremonyLabel: "Nikâh",
    /** Absolute instants keep the countdown correct outside Turkey too. */
    countdownTarget: "2026-10-04T18:30:00+03:00",
    celebrationEnd: "2026-10-05T00:00:00+03:00",
    schedule: [
      { time: "18.30", label: "Karşılama", detail: "Bahçede ilk buluşma" },
      { time: "19.30", label: "Nikâh", detail: "Birlikte söyleyeceğimiz evet" },
      { time: "20.00", label: "İkram", detail: "Sofrada paylaşacağımız tatlar" },
      { time: "21.00", label: "Eğlence", detail: "Müzik, dans ve kutlama" },
    ],
  },

  /* ----------------------------------------------------------------- venue */

  venue: {
    /** The official venue name. Used everywhere, without exception. */
    name: "Aden Boğazköy Tesisleri",
    /** The wedding takes place in this space within the venue. */
    spaceName: "Camlı Köşk",
    /** Short location label used next to the venue name in the hero. */
    locationShort: "Arnavutköy",
    /** Location label used in the event and venue sections. */
    location: "Arnavutköy, İstanbul",
    /** Full postal address, shown in the venue section. */
    address: "Boğazköy Mahallesi, Aden Boğazköy Tesisleri, Arnavutköy, İstanbul",
  },

  /* ------------------------------------------------------------- artwork */

  artwork: {
    /**
     * Art-directed, lossless derivatives of the canonical RGBA master. They are
     * cropped and positioned for their destination, never redrawn or filtered.
     */
    heroDesktop: {
      src: "/artwork/venue-hero-desktop-master.webp",
      width: 1600,
      height: 1000,
    },
    heroMobile: {
      src: "/artwork/venue-hero-mobile-master.webp",
      width: 900,
      height: 1800,
    },
    venueDetail: {
      src: "/artwork/venue-interior-approved.png",
      width: 1536,
      height: 1024,
    },
    illustrationAlt:
      "Aden Boğazköy Tesisleri'nin iç mekânını, avizeleri, tavan drapelerini ve çiçekli koridorunu gösteren suluboya illüstrasyon",
    botanical: "/artwork/botanical-branch.webp",
    botanicalAlt: "",
  },

  /* -------------------------------------------------------------- sections */

  hero: {
    overline: "Düğünümüze davetlisiniz",
    /** Understated call to action that scrolls to the RSVP section. */
    ctaLabel: "Katılım Bildir",
    /** Text next to the scroll indicator. */
    scrollHint: "Aşağı kaydırın",
    navigation: {
      invitation: "Davet",
      weddingDay: "Program",
      venue: "Mekân",
      rsvp: "Katılım",
    },
    countdown: {
      overline: "Düğüne kalan",
      days: "Gün",
      hours: "Saat",
      minutes: "Dakika",
      seconds: "Saniye",
      today: "Bugün bizim günümüz",
      after: "Bu güzel günü bizimle paylaştığınız için teşekkür ederiz.",
    },
  },

  invitation: {
    overline: "Davet",
    body: "Birlikte başlayacağımız yeni hayatın ilk akşamında, mutluluğumuzu paylaşmanızdan onur duyarız.",
  },

  eventDetails: {
    overline: "Program",
    heading: "Düğün Günü",
    intro: "Akşamın her anını sizinle birlikte, aynı sofrada ve aynı neşede paylaşmak istiyoruz.",
  },

  venueSection: {
    overline: "Mekân",
    heading: "Aden Boğazköy Tesisleri",
    spaceLabel: "Camlı Köşk · Arnavutköy",
    /** External link to maps driving directions. */
    directionsLabel: "Yol Tarifi Al",
    /** Accessible title for the embedded map iframe. */
    mapTitle: "Aden Boğazköy Tesisleri konumunu gösteren Google Haritalar haritası",
  },

  /* ------------------------------------------------------------------ rsvp */

  rsvp: {
    overline: "Katılım",
    heading: "Bizimle Olacak mısınız?",
    intro:
      "Hazırlıklarımızı tamamlayabilmemiz için katılım durumunuzu 20 Eylül 2026 tarihine kadar bildirmenizi rica ederiz.",

    /**
     * Maximum guest count offered immediately while the form fetches the same
     * authoritative limit from the server.
     */
    maxGuests: 10,

    labels: {
      fullName: "Ad Soyad",
      attendance: "Katılım durumunuz",
      attending: "Katılacağım",
      notAttending: "Katılamayacağım",
      guestCount: "Kaç kişi katılacaksınız?",
      note: "Eklemek istediğiniz bir not",
      submit: "Katılımı Gönder",
      submitting: "Gönderiliyor…",
      update: "Yanıtımı Güncelle",
    },

    hints: {
      fullName: "Davetiyede yazan adınızı kullanabilirsiniz.",
      guestCount: "Kendiniz dâhil, size eşlik edecek toplam kişi sayısı.",
      note: "İsteğe bağlı. Bize iletmek istediğiniz herhangi bir şey olabilir.",
    },

    messages: {
      successSent: "Yanıtınız gönderildi.",
      successAttending: "Teşekkür ederiz, sizi aramızda görmek bizi çok mutlu edecek.",
      successNotAttending: "Bildirdiğiniz için teşekkür ederiz, sizi o akşam çok özleyeceğiz.",
      successUpdated: "Yanıtınız güncellendi.",
      successFootnote: "Dilediğiniz zaman bu formu tekrar doldurarak yanıtınızı güncelleyebilirsiniz.",
      editAgain: "Yanıtımı düzenle",
    },

    errors: {
      fullNameRequired: "Lütfen adınızı ve soyadınızı yazın.",
      fullNameTooShort: "Adınız en az 2 karakter olmalı.",
      fullNameTooLong: "Adınız en fazla 120 karakter olabilir.",
      attendanceRequired: "Lütfen katılım durumunuzu seçin.",
      guestCountRequired: "Lütfen kişi sayısını girin.",
      guestCountRange: "Kişi sayısı 1 ile {max} arasında olmalı.",
      noteTooLong: "Not en fazla 500 karakter olabilir.",
      network:
        "Sunucuya şu anda ulaşılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyebilirsiniz. Yazdıklarınız formda duruyor.",
      timeout: "Sunucu zamanında yanıt vermedi. Lütfen birkaç saniye sonra tekrar deneyin.",
      server: "Bir şeyler ters gitti. Lütfen birkaç dakika sonra tekrar deneyin.",
      validation: "Gönderdiğiniz bilgilerde bir sorun var. Lütfen alanları kontrol edin.",
      rateLimited: "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.",
      retry: "Tekrar Dene",
    },

    /** Shown under the form. */
    privacyNote: "Paylaştığınız bilgiler yalnızca düğün katılım planlaması için kullanılacaktır.",
  },

  footer: {
    /** One restrained closing detail. */
    closing: "Sizi aramızda görmek en büyük hediyemiz olacak.",
  },

  /* ------------------------------------------------------------------ maps */

  /**
   * `embedUrl`      Google Maps → the venue → Share → Embed a map → copy only the
   *                 `src="…"` value from the generated iframe and paste it here.
   * `directionsUrl` Google Maps → the venue → Directions → Share → copy the link.
   * `appDirections` Universal map links shown in the mobile app chooser.
   *
   * When `embedUrl` is empty no map or placeholder card is rendered. When
   * `directionsUrl` is empty the directions link is hidden.
   */

  maps: {
    // Aden Boğazköy Tesisleri: 41.161347, 28.775932.
    // Keep every map provider pointed at the same verified venue coordinate.
    embedUrl: "https://www.google.com/maps?q=41.161347,28.775932&z=16&output=embed",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=41.161347,28.775932",
    appDirections: {
      appleMaps: "https://maps.apple.com/?daddr=41.161347,28.775932&dirflg=d",
      googleMaps: "https://www.google.com/maps/dir/?api=1&destination=41.161347,28.775932",
      waze: "https://www.waze.com/ul?ll=41.161347%2C28.775932&navigate=yes",
    },
  },

  /* -------------------------------------------------------------- metadata */

  metadata: {
    title: "Seçil & Uğur · 4 Ekim 2026",
    description:
      "Seçil ve Uğur'un düğün daveti. 4 Ekim 2026 Pazar, saat 18.30, Aden Boğazköy Tesisleri Camlı Köşk, Arnavutköy, İstanbul. Katılım bildirimi için tıklayın.",
    /** Used for <html lang> and Open Graph locale. */
    locale: "tr_TR",
    keywords: ["Seçil Uğur düğün", "düğün daveti", "Aden Boğazköy Tesisleri", "4 Ekim 2026"],
  },

  share: {
    ogTitle: "Seçil & Uğur evleniyor",
    ogDescription: "4 Ekim 2026, Pazar · 18.30 · Aden Boğazköy Tesisleri · Camlı Köşk",
    /** Generated by `pnpm --filter web artwork`. */
    ogImage: "/artwork/social-share.jpg",
    /** Alt text for the Open Graph image. */
    ogImageAlt: "Seçil & Uğur · 4 Ekim 2026 · Aden Boğazköy Tesisleri",
    /**
     * Public address the site will be served from, e.g. "https://secilveugur.com".
     * Leave empty until you know it. While it is empty the Open Graph image is
     * referenced by a relative path, which some social networks will not resolve.
     */
    siteUrl: "",
  },

  /** Browser chrome colour, matched to the top and bottom of the page. */
  theme: {
    lightThemeColor: "#F7F5F1",
    darkThemeColor: "#242321",
  },
} as const;

export type Site = typeof site;
