// Icônes SVG inline (trait 1.8, style « outline ») — aucune dépendance
// externe. Toutes acceptent className pour la taille/couleur Tailwind.
import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Svg(props: Props & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconeAccueil = (p: Props) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
  </Svg>
);

export const IconeCalendrier = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconeCourses = (p: Props) => (
  <Svg {...p}>
    <path d="M3 4h2l2.6 12.5a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20.5 8H6" />
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
  </Svg>
);

export const IconeFacture = (p: Props) => (
  <Svg {...p}>
    <path d="M6 2.5h12v19l-2.5-1.7L13 21.5l-2.5-1.7L8 21.5l-2-1.7z" />
    <path d="M9 7.5h6M9 11h6M9 14.5h3.5" />
  </Svg>
);

export const IconeMembres = (p: Props) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M15.8 15.2c2.4.2 4.2 1.8 4.7 4.6" />
  </Svg>
);

export const IconeContacts = (p: Props) => (
  <Svg {...p}>
    <path d="M5 4.5c0-1 .8-2 1.9-2h2L10.5 6 8.6 7.9a13 13 0 0 0 7.5 7.5l1.9-1.9 3.5 1.6v2c0 1.1-1 2-2 1.9C11 18.3 5.7 13 5 4.5z" />
  </Svg>
);

export const IconeDocument = (p: Props) => (
  <Svg {...p}>
    <path d="M6 2.5h8l4 4v15H6z" />
    <path d="M14 2.5v4h4M9 12h6M9 15.5h6" />
  </Svg>
);

export const IconeEcheance = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4.5l3 1.5M9 2.5h6" />
  </Svg>
);

export const IconePlus = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconeMenu = (p: Props) => (
  <Svg {...p}>
    <circle cx="5" cy="5" r="1.8" />
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="19" cy="5" r="1.8" />
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
    <circle cx="5" cy="19" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
    <circle cx="19" cy="19" r="1.8" />
  </Svg>
);

export const IconeRecherche = (p: Props) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.6-4.6" />
  </Svg>
);

export const IconeAlerte = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 9.5V14M12 17.2v.1" />
  </Svg>
);

export const IconeExport = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3v11M8 10l4 4 4-4" />
    <path d="M4 17v3h16v-3" />
  </Svg>
);

export const IconeDeconnexion = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4H6v16h8" />
    <path d="M10 12h11M17.5 8.5 21 12l-3.5 3.5" />
  </Svg>
);

export const IconeCorbeille = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5 8 21h8l1.5-14.5" />
  </Svg>
);

export const IconeCrayon = (p: Props) => (
  <Svg {...p}>
    <path d="m4 20 .9-3.8L16.7 4.4a1.8 1.8 0 0 1 2.6 0l.3.3a1.8 1.8 0 0 1 0 2.6L7.8 19.1z" />
  </Svg>
);

export const IconeCoche = (p: Props) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconeRotation = (p: Props) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 14-5.3L20 8.5" />
    <path d="M20 4v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-14 5.3L4 15.5" />
    <path d="M4 20v-4.5h4.5" />
  </Svg>
);

export const IconeLien = (p: Props) => (
  <Svg {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />
  </Svg>
);

export const IconeChevronGauche = (p: Props) => (
  <Svg {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </Svg>
);

export const IconeChevronDroite = (p: Props) => (
  <Svg {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </Svg>
);
