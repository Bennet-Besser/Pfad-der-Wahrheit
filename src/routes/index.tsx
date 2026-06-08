import { createFileRoute } from "@tanstack/react-router";
import RealityShift from "@/components/RealityShift";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reality Shift — Philosophisches Multiplayer-Brettspiel" },
      { name: "description", content: "Reality Shift: Würfle, ziehe, denke. Ein futuristisches Brettspiel über Wahrheit, Realität und Erkenntnis für 2–4 Spieler auf dem iPad." },
      { property: "og:title", content: "Reality Shift" },
      { property: "og:description", content: "Philosophisches Multiplayer-Brettspiel für 2–4 Spieler." },
    ],
  }),
  component: RealityShift,
});
