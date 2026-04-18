import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ session_id: "todo" });
}
