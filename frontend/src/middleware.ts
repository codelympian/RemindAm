import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that require an authenticated Clerk session. The marketing home,
// `/status`, and the Clerk sign-in/up routes stay public.
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/today(.*)',
  '/customers(.*)',
  '/leads(.*)',
  '/sales(.*)',
  '/products(.*)',
  '/imports(.*)',
  '/analytics(.*)',
  '/settings(.*)',
  '/account(.*)',
  '/onboarding(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Clerk auto-proxy path
    '/__clerk/:path*',
  ],
};
