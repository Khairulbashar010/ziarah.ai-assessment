import { NextRequest, NextResponse } from "next/server";
import { toClientTripResponse } from "@/lib/trip-search/client-payload";
import { getTripResult } from "@/lib/storage/trip-results";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getTripResult(id);

  if (!result) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  return NextResponse.json(toClientTripResponse(result));
}
