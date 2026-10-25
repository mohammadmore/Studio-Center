declare module "moment-hijri";

declare namespace Express {
  export interface Request {
    session?: any;
    sessionOptions?: any;
    /** The logged-in user from the session, re-validated on every request. */
    user?: any;
    /** The stored colleague or organisation record behind `user`. */
    account?: any;
  }
}
