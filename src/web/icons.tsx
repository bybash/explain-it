import type { ReactNode } from "react";

/** The app's icons, drawn in the Lucide style on a 24 × 24 grid; each button that uses one says what it does. */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    className="size-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const CodeIcon = () => (
  <Icon>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </Icon>
);
export const DiagramIcon = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <path d="M6.5 10v4.5a3 3 0 0 0 3 3H14" />
  </Icon>
);
export const ExpandIcon = () => (
  <Icon>
    <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const ZoomInIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const ZoomOutIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);
export const FitIcon = () => (
  <Icon>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </Icon>
);
