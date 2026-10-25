import cookieSession from "cookie-session";
import { config } from "../config.js";

export const SESSION_COOKIE = "session";

const crossSite = config.allowPreviewFrame;
const cookieSessionMiddleware = cookieSession({
  name: SESSION_COOKIE,
  keys: [config.sessionSecret],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  // A cross-site iframe (preview) needs SameSite=None, which requires Secure.
  secure: crossSite || config.cookieSecure,
  sameSite: crossSite ? "none" : "lax",
});

/** Session cookie handling, shared with the Socket.IO handshake. */
export function sessionMiddleware() {
  return (req: any, res: any, next: any) => {
    cookieSessionMiddleware(req, res, (err?: any) => {
      if (err) return next(err);
      // cookie-session throws when asked to send a Secure cookie over plain http
      // (e.g. a health check reaching the app directly behind the TLS proxy).
      if (!req.secure && req.sessionOptions) req.sessionOptions.secure = false;
      next();
    });
  };
}

