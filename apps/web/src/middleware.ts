import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/verify",
  "/forgot-password",
  "/pricing",
  "/auth/login",
];
const ADMIN_ROLES = ["admin", "superadmin"];

// Routes only accessible by admin/superadmin
const ADMIN_ONLY_PATHS = [
  "/admin",
  "/questions",
  "/generate",
  "/scraper",
  "/scrape",
  "/syllabus",
  "/dashboard/find",
  "/dashboard/saved",
];

function getDefaultRoute(role: string, onboardingCompleted: boolean): string {
  if (ADMIN_ROLES.includes(role)) return "/admin";
  if (!onboardingCompleted) return "/onboarding";
  return "/dashboard";
}

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATHS.some((p) =>
    p === "/admin" ? pathname.startsWith("/admin") : pathname.startsWith(p),
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/payment") ||
    pathname.startsWith("/exams") ||
    pathname.startsWith("/examinations") ||
    pathname.startsWith("/topics") ||
    pathname.startsWith("/_next");

  if (isPublic) return NextResponse.next();

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (token.role as string) ?? "student";
  const onboardingCompleted = (token.onboardingCompleted as boolean) ?? false;

  // Redirect authenticated users away from auth pages
  if (pathname === "/login" || pathname === "/signup" || pathname === "/auth/login") {
    return NextResponse.redirect(new URL(getDefaultRoute(role, onboardingCompleted), request.url));
  }

  // Admin-only routes: redirect non-admins to their default page
  if (isAdminOnlyPath(pathname) && !ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect non-onboarded users to onboarding (except if already on /onboarding)
  if (!ADMIN_ROLES.includes(role) && !onboardingCompleted && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Redirect already-onboarded users away from /onboarding
  if (pathname === "/onboarding" && onboardingCompleted) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
