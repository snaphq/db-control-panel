import { destroyAdminSession } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await destroyAdminSession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
