import type { ReactNode } from "react";
import styles from "./social-links.module.css";

// Outline icons from Tabler (tabler.io/icons, MIT licence), pasted in as SVG.
// They draw with currentColor, so each icon takes the colour of its link.

export function TablerIcon({
  size = 22,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const LINKS = [
  {
    href: "https://twitter.com/choxi",
    label: "X / Twitter",
    icon: (
      <>
        <path d="M4 4l11.733 16h4.267l-11.733 -16l-4.267 0" />
        <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
      </>
    ),
  },
  {
    href: "https://github.com/choxi",
    label: "GitHub",
    icon: (
      <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
    ),
  },
  {
    href: "https://www.linkedin.com/in/choxi",
    label: "LinkedIn",
    icon: (
      <>
        <path d="M8 11v5" />
        <path d="M8 8v.01" />
        <path d="M12 16v-5" />
        <path d="M16 16v-3a2 2 0 1 0 -4 0" />
        <path d="M3 7a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4l0 -10" />
      </>
    ),
  },
];

export function MapPinIcon({ size = 16 }: { size?: number }) {
  return (
    <TablerIcon size={size}>
      <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />
    </TablerIcon>
  );
}

export default function SocialLinks({ className }: { className?: string }) {
  return (
    <ul className={[styles.row, className].filter(Boolean).join(" ")}>
      {LINKS.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            className={styles.link}
          >
            <TablerIcon>{link.icon}</TablerIcon>
          </a>
        </li>
      ))}
    </ul>
  );
}
