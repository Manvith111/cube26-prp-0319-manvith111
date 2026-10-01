import { PlannedManager } from "@/components/PlannedManager";

export default function ReturnsPage() {
  return (
    <PlannedManager
      config={{
        name: "Returns Manager",
        question: "What came back, what condition, and what happens next?",
        decisions: ["RESTOCK", "REFURBISH", "LIQUIDATE", "DISPOSE", "UNCERTAIN"],
        summary:
          "Inspects returned units, grades their condition, and routes each to its best recovery path.",
        checks: [
          "Unit matches the return SKU",
          "Condition grade (new / used / damaged)",
          "All components and accessories present",
          "Original packaging present",
          "Signs of use or wear",
          "Hygiene / safety seal intact",
        ],
      }}
    />
  );
}
