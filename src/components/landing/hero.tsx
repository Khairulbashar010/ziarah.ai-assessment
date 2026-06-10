"use client";

import { Luggage } from "lucide-react";

export function Hero() {
  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center">
        <div className="rounded-2xl bg-white/5 p-4">
          <Luggage className="h-10 w-10 text-purple-300" />
        </div>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
        Meet Ziarah Travel AI
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
        Your personal AI travel agent that plans and books complete trips in one
        conversation.
      </p>
    </div>
  );
}
