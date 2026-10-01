import { PlannedManager } from "@/components/PlannedManager";

export default function ReceivingPage() {
  return (
    <PlannedManager
      config={{
        name: "Receiving Manager",
        question: "Did we receive what we ordered, undamaged?",
        decisions: ["ACCEPT", "EXCEPTION", "UNCERTAIN"],
        summary:
          "Inspects inbound stock from a supplier against the purchase order on arrival, before it enters inventory.",
        checks: [
          "SKU matches the purchase order",
          "Quantity received matches the PO",
          "No visible transit damage",
          "Correct expiry / lot where applicable",
          "Outer packaging intact",
          "Supplier labeling is correct",
        ],
      }}
    />
  );
}
