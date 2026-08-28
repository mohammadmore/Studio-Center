declare module 'moment-hijri';
declare module "xss-clean";

declare namespace Express {
  export interface Request {
    session?: any;
  }
}

declare module 'cookie-session' {
  interface CookieSessionInterfaces {
    user: any;
  }
}

declare module 'express-session' {
  interface SessionData {
    user: any;
  }
}
