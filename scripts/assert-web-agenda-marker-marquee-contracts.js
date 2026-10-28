/* global __dirname */
const fs = require("fs");
const path = require("path");

const agendaSource = fs.readFileSync(
  path.resolve(__dirname, "..", "app", "(tabs)", "agenda.tsx"),
  "utf8",
);

const requirePattern = (pattern, message) => {
  if (!pattern.test(agendaSource)) throw new Error(message);
};

requirePattern(
  /\{!IS_WEB &&\s*isConfiguredTimeMarker &&\s*isFirstDayColumn \? \([\s\S]{0,280}?weekPlannerConfiguredMarkerLeadAnchor/,
  "The web time gutter must not receive a configured-marker lead.",
);
requirePattern(
  /isConfiguredTimeMarker &&\s*!useOperatorLaneMode &&\s*cellState !== 'occupied' &&\s*!appointmentStart \? \(/,
  "Day-level configured markers must skip occupied cells.",
);
requirePattern(
  /\{isConfiguredTimeMarker &&\s*!laneOccupyingAppointment &&\s*!laneStartAppointment \? \([\s\S]{0,520}?weekPlannerConfiguredMarkerLineWeb/,
  "Lane-level configured markers must skip appointment starts and continuations.",
);
requirePattern(
  /weekPlannerConfiguredMarkerLineWeb:\s*\{[\s\S]{0,520}?top: -1\.25,[\s\S]{0,120}?left: 4,[\s\S]{0,80}?right: 4,[\s\S]{0,80}?height: 2\.5,[\s\S]{0,180}?backgroundColor: 'rgba\(30, 41, 59, 0\.52\)'/,
  "Web configured markers must use the visible premium boundary treatment.",
);
requirePattern(
  /\{IS_WEB\s*\? 'Segnano con precisione il bordo dell’orario e si fermano prima degli appuntamenti\.[\s\S]{0,220}?: 'Evidenziano l’orario in nero e attraversano gli slot\./,
  "The web marker help text must describe boundary-only, appointment-safe rendering without changing native copy.",
);
requirePattern(
  /translateX\.setValue\(0\);[\s\S]{0,420}?if \(IS_WEB\) return;[\s\S]{0,160}?if \(!isOverflowing\) return;/,
  "Web Agenda labels must not start the native infinite marquee loop.",
);
requirePattern(
  /if \(IS_WEB\) \{[\s\S]{0,1600}?data-salon-agenda-marquee-track[\s\S]{0,800}?--salon-agenda-marquee-distance[\s\S]{0,800}?--salon-agenda-marquee-duration/,
  "Overflowing web Agenda labels must use the CSS compositor marquee.",
);

const globalCss = fs.readFileSync(
  path.resolve(__dirname, "..", "app", "global.css"),
  "utf8",
);

if (
  !/@keyframes salon-agenda-marquee-web[\s\S]{0,700}?translate3d/.test(
    globalCss,
  ) ||
  !/\[aria-hidden='true'\][\s\S]{0,180}?\[data-salon-agenda-marquee-track='true'\][\s\S]{0,120}?animation-play-state: paused/.test(
    globalCss,
  )
) {
  throw new Error(
    "The web Agenda CSS marquee must run on transforms and pause in inactive scenes.",
  );
}

console.log("PASS web Agenda marker and compositor-marquee contracts");
