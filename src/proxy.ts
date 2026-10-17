import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED = [
  "/feed",
  "/p",
  "/new",
  "/search",
  "/t",
  "/u",
  "/bookmarks",
  "/notifications",
  "/settings",
  "/mod",
  "/workspace",
  "/platform",
  "/pending",
];

/** Convenience redirects only — tRPC procedures are the real auth check. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = !!getSessionCookie(request);
  if (
    !signedIn &&
    PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
