import { PlannedManager } from "@/components/PlannedManager";

export default function PackPage() {
  return (
    <PlannedManager
      config={{
        name: "Pack Manager",
        question: "Does the box contain exactly what was ordered?",
        decisions: ["SEAL", "STOP & FIX", "UNCERTAIN"],
        summary:
          "Checks an outbound box against the order before it is sealed, so the right items and quantities ship to the customer.",
        checks: [
          "Every ordered SKU is present",
          "Quantities match the order",
          "No extra or wrong items in the box",
          "Correct variant / size / colour",
          "Packing slip matches the contents",
          "Protection / dunnage is adequate",
        ],
      }}
    />
  );
}
