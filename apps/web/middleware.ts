export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/rooms", "/room/:path*", "/game/:path*", "/results/:path*"]
};
