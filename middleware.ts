import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // Protect /canvas: redirect unauthenticated users to /signin
  if (!sessionCookie && pathname.startsWith("/canvas")) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users from landing page or /signin to /canvas
  if (sessionCookie && (pathname === "/" || pathname === "/signin")) {
    return NextResponse.redirect(new URL("/canvas", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/signin", "/canvas/:path*"],
};
