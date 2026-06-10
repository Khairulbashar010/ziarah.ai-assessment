export type ProcessingStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

export const INITIAL_PROCESSING_STEPS: ProcessingStep[] = [
  { id: "understand", label: "Understanding your trip", status: "active" },
  { id: "parse", label: "Reading your dates, route, and travellers", status: "pending" },
  { id: "flights", label: "Searching for flights", status: "pending" },
  { id: "hotels", label: "Finding hotel stays for you", status: "pending" },
  { id: "build", label: "Putting your trip together", status: "pending" },
];
