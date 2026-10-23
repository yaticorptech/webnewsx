/**
 * The share menu's icons (owner 2026-10-22: "the real icons"): each app's own logo in its brand colour, as the round
 * badges people know from their phones — WhatsApp green, X black, Facebook and LinkedIn blue, Telegram light blue — plus
 * matching badges for Email, Copy link (WebNEWS red) and the phone's own share sheet. 24×24 SVGs with explicit colours
 * (lucide v1 ships no brand icons); `size` sets the rendered box (an inline size, so a menu's `[&_svg]` sizing doesn't
 * shrink them).
 */

type IconProps = { className?: string; size?: number };

const BRAND = {
  whatsapp: "#25D366",
  x: "#000000",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  telegram: "#26A5E4",
} as const;

function Badge({ className, size = 24, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} style={{ width: size, height: size }}>
      {children}
    </svg>
  );
}

const WHATSAPP =
  "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88a9.82 9.82 0 0 1 6.99 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41Z";

const X_LOGO = "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.59l5.25 6.93 6.06-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z";

/** The blue disc with the "f" cut out (drawn over white, so the f shows white). */
const FACEBOOK =
  "M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.96 10.13 11.86v-8.39H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.52c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.39C19.61 23.03 24 18.06 24 12.07Z";

/** The blue rounded square with "in" cut out (drawn over white). */
const LINKEDIN =
  "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0h.01Z";

/** The light-blue disc with the paper plane cut out (drawn over white). */
const TELEGRAM =
  "M11.94 0A12 12 0 1 0 12 24 12 12 0 0 0 11.94 0Zm4.97 7.22c.1 0 .32.02.46.14.1.08.16.2.17.33.02.09.04.3.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.22-.46-1.9-.9-1.05-.7-1.65-1.13-2.67-1.8-1.19-.78-.42-1.21.26-1.91.17-.18 3.25-2.98 3.3-3.23 0-.03.02-.15-.05-.21-.07-.06-.18-.04-.25-.02-.1.02-1.8 1.14-5.06 3.34-.48.33-.91.49-1.3.48-.43-.01-1.26-.24-1.87-.44-.75-.24-1.35-.37-1.3-.79.03-.21.33-.44.9-.66 3.5-1.53 5.83-2.53 7-3.02 3.33-1.38 4.02-1.62 4.47-1.63Z";

export const WhatsAppIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12" r="12" fill={BRAND.whatsapp} />
    <g transform="translate(5 5) scale(0.583)" fill="#fff">
      <path d={WHATSAPP} />
    </g>
  </Badge>
);

export const XIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12" r="12" fill={BRAND.x} />
    <g transform="translate(6.6 6.6) scale(0.45)" fill="#fff">
      <path d={X_LOGO} />
    </g>
  </Badge>
);

export const FacebookIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12.07" r="11.5" fill="#fff" />
    <path d={FACEBOOK} fill={BRAND.facebook} />
  </Badge>
);

export const LinkedInIcon = (props: IconProps) => (
  <Badge {...props}>
    <rect x="1" y="1" width="22" height="22" rx="4" fill="#fff" />
    <path d={LINKEDIN} fill={BRAND.linkedin} />
  </Badge>
);

export const TelegramIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12" r="11.5" fill="#fff" />
    <path d={TELEGRAM} fill={BRAND.telegram} />
  </Badge>
);

/**
 * Email: Gmail's own "M" (owner 2026-10-22: "the original Gmail icon") — the 2020 logo's five pieces in Google's
 * colours, on a white disc with a faint ring so it shows on a white menu. The link itself is mailto:, so it opens
 * whichever mail app the phone or computer uses.
 */
export const EmailIcon = (props: IconProps) => {
  // The logo is drawn in its own 88 × 66 box (origin 52,42); fit it to 14 px wide, centred.
  const scale = 14 / 88;
  const tx = (24 - 88 * scale) / 2 - 52 * scale;
  const ty = (24 - 66 * scale) / 2 - 42 * scale;
  return (
    <Badge {...props}>
      <circle cx="12" cy="12" r="11.5" fill="#fff" stroke="var(--border)" />
      <g transform={`translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(4)})`}>
        <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
        <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
        <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
        <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
        <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
      </g>
    </Badge>
  );
};

/** Copy link: the link glyph on a WebNEWS-red disc. */
export const CopyLinkIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12" r="12" fill="var(--brand)" />
    <g transform="translate(5.5 5.5) scale(0.54)" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </g>
  </Badge>
);

/** "Share via…": the phone's own share sheet — the share glyph on an ink disc (light on dark in dark mode). */
export const ShareViaIcon = (props: IconProps) => (
  <Badge {...props}>
    <circle cx="12" cy="12" r="12" fill="var(--ink)" />
    <g transform="translate(5.5 5.5) scale(0.54)" fill="none" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </g>
  </Badge>
);

/** Instagram: the camera on the brand's sunset gradient (a rounded square, like the app icon). */
export const InstagramIcon = ({ className, size = 24 }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className} style={{ width: size, height: size }}>
    <defs>
      <radialGradient id="wn-ig-a" cx="30%" cy="107%" r="150%">
        <stop offset="0%" stopColor="#fdf497" />
        <stop offset="10%" stopColor="#fdf497" />
        <stop offset="50%" stopColor="#fd5949" />
        <stop offset="100%" stopColor="#d6249f" />
      </radialGradient>
      <radialGradient id="wn-ig-b" cx="110%" cy="-5%" r="120%">
        <stop offset="0%" stopColor="#4f5bd5" stopOpacity="1" />
        <stop offset="60%" stopColor="#4f5bd5" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#wn-ig-a)" />
    <rect width="24" height="24" rx="6" fill="url(#wn-ig-b)" />
    <g fill="none" stroke="#fff" strokeWidth="1.9">
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.3" />
    </g>
    <circle cx="16.4" cy="7.6" r="1.05" fill="#fff" />
  </svg>
);
