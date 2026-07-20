export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/", "/explainer/:path*", "/issue-solver/:path*"],
};