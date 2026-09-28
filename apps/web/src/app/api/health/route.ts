// Liveness only for now; INS-18 adds the db/redis/s3 checks from spec/api.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.npm_package_version ?? "dev",
  });
}
