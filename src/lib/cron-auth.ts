/** Vercel Cron envía `Authorization: Bearer ${CRON_SECRET}`. */
export const isCronAuthorized = (req: Request) =>
  !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
