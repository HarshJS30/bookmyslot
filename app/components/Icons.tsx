import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "fill" | "stroke" | "strokeWidth"> & {
  size?: number;
  weight?: "regular" | "bold" | "fill";
};

type Tint = { fill?: string; fillOpacity?: number };

function create(draw: (tint: Tint) => ReactNode, solid = false) {
  return function AppIcon({ size = 20, weight = "regular", ...props }: IconProps) {
    const tint: Tint = weight === "fill" ? { fill: "currentColor", fillOpacity: solid ? 1 : 0.18 } : {};
    const labelled = props["aria-label"] !== undefined;

    return (
      <svg
        aria-hidden={labelled ? undefined : true}
        fill="none"
        height={size}
        role={labelled ? "img" : undefined}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={weight === "bold" ? 2.25 : 1.75}
        viewBox="0 0 24 24"
        width={size}
        {...props}
      >
        {draw(tint)}
      </svg>
    );
  };
}

const dot = { fill: "currentColor", stroke: "none" } as const;

/* ---------- arrows and marks ---------- */

export const ArrowLeft = create(() => <path d="M19 12H5M11 6l-6 6 6 6" />);

export const ArrowRight = create(() => <path d="M5 12h14M13 6l6 6-6 6" />);

export const ArrowUpRight = create(() => <path d="M7 17 17 7M9 7h8v8" />);

export const Check = create(() => <path d="m5 12.5 4.5 4.5L19 7.5" />);

export const X = create(() => <path d="M6 6l12 12M18 6L6 18" />);

export const ArrowsClockwise = create(() => (
  <>
    <path d="M19.2 10a7.5 7.5 0 1 0 .1 4" />
    <path d="M16.5 6.5 19.5 9l2-3.5" />
  </>
));

/* ---------- interface ---------- */

export const MagnifyingGlass = create((t) => (
  <>
    <circle cx="10.8" cy="10.8" r="6.6" {...t} />
    <path d="m15.7 15.7 4.5 4.5" />
  </>
));

/* calendar page: month strip on top, day block below (the same idea as <DateTile />) */
export const CalendarBlank = create((t) => (
  <>
    <rect x="4" y="5" width="16" height="15" rx="4" {...t} />
    <path d="M8 3.5v3M16 3.5v3M4 9.5h16" />
    <rect x="9.25" y="12.5" width="5.5" height="4" rx="1.5" {...dot} />
  </>
));

export const Clock = create((t) => (
  <>
    <circle cx="12" cy="12" r="8.25" {...t} />
    <path d="M12 7.5v4.8l3.2 1.9" />
  </>
));

export const Timer = create((t) => (
  <>
    <circle cx="12" cy="13.5" r="7.5" {...t} />
    <path d="M10 3h4M12 13.5V10M17.8 7.2L19 6" />
  </>
));

export const EnvelopeSimple = create((t) => (
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="4" {...t} />
    <path d="m4.5 8 7.5 5.5L19.5 8" />
  </>
));

export const Heart = create(
  (t) => (
    <path
      d="M12 19.3 10.8 18.2C6.5 14.3 4 12 4 9.1 4 6.7 5.9 5 8.2 5c1.5 0 2.9.7 3.8 1.9A4.8 4.8 0 0 1 15.8 5C18.1 5 20 6.7 20 9.1c0 2.9-2.5 5.2-6.8 9.1z"
      {...t}
    />
  ),
  true,
);

export const Lock = create((t) => (
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="3" {...t} />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    <circle cx="12" cy="15.2" r="1" {...dot} />
  </>
));

export const ShareNetwork = create(() => (
  <>
    <path d="M12 15V4.5M8 8l4-4 4 4" />
    <path d="M6 12.5v4a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-4" />
  </>
));

export const ShieldCheck = create((t) => (
  <>
    <path d="M12 3.5l7 2.6v5.4c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6.1z" {...t} />
    <path d="M9 12l2.2 2.2L15.2 10" />
  </>
));

export const SealCheck = create((t) => (
  <>
    <circle cx="12" cy="12" r="8.5" {...t} />
    <path d="M8.5 12.3l2.5 2.5 4.5-4.8" />
  </>
));

export const WarningCircle = create((t) => (
  <>
    <circle cx="12" cy="12" r="8.5" {...t} />
    <path d="M12 7.8v5" />
    <circle cx="12" cy="16.2" r="1" {...dot} />
  </>
));

export const UserCircle = create((t) => (
  <>
    <circle cx="12" cy="12" r="8.5" {...t} />
    <circle cx="12" cy="10" r="2.8" />
    <path d="M6.8 18c1-2.3 3-3.5 5.2-3.5s4.2 1.2 5.2 3.5" />
  </>
));

export const SignOut = create(() => (
  <>
    <path d="M10 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19H10" />
    <path d="M14 8l4 4-4 4M18 12H9.5" />
  </>
));

/* ---------- places and tickets ---------- */

export const MapPin = create((t) => (
  <>
    <path d="M12 21c-4-4.3-6.5-7.6-6.5-11a6.5 6.5 0 0 1 13 0c0 3.4-2.5 6.7-6.5 11z" {...t} />
    <circle cx="12" cy="10" r="2.4" />
  </>
));

export const NavigationArrow = create(
  (t) => <path d="M4.5 11.5l15-6.5-6.5 15-2.2-6.3z" {...t} />,
  true,
);

/* ticket: torn left edge, dashed stub line, text lines, right notch, a second ticket behind */
export const Ticket = create((t) => (
  <>
    <path d="M7.5 7.5V6A1.5 1.5 0 0 1 9 4.5h10.5A1.5 1.5 0 0 1 21 6v8" />
    <path
      d="M5 7.5h12A1.5 1.5 0 0 1 18.5 9v1.4a1.6 1.6 0 0 0 0 3.2V15a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1 0-3 1.5 1.5 0 0 0 0-3 1.5 1.5 0 0 1 0-3z"
      {...t}
    />
    <path d="M8.5 9.2v1.4M8.5 13.4v1.4" />
    <path d="M11.5 10.3h4M11.5 13.7h3" />
  </>
));
