export type ProcessingStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

export const INITIAL_PROCESSING_STEPS: ProcessingStep[] = [
  { id: "understand", label: "Understanding your trip request", status: "active" },
  { id: "parse", label: "Extracting dates, route, and travelers", status: "pending" },
  { id: "flights", label: "Searching our flight inventory", status: "pending" },
  { id: "hotels", label: "Finding the best hotel stays for you", status: "pending" },
  { id: "build", label: "Building your personalized itinerary", status: "pending" },
];
