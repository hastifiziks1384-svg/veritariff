import { NextRequest, NextResponse } from "next/server";

/**
 * Password gate for demo deployments.
 *
 * Active only when BASIC_AUTH_PASSWORD is set (so local dev is unaffected).
 * Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD in the hosting platform's
 * environment variables to lock the whole site behind a browser login popup.
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // No password configured -> gate disabled (local dev).
  if (!password) return NextResponse.next();

  const expected = "Basic " + btoa(`${user ?? "demo"}:${password}`);
  if (req.headers.get("authorization") === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Veritariff demo"' },
  });
}

export const config = {
  // Protect everything except Next.js internals and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
