import { NextFunction, Request, Response } from "express";

/**
 * Express 4 does not catch a rejected Promise thrown out of an `async`
 * route handler — it becomes an unhandled rejection, and Node (since v15)
 * terminates the whole process on those by default. That means a single
 * bad request (e.g. a race that trips a UNIQUE constraint) could take the
 * entire API down for every user. Wrap any `async` handler with this so
 * its errors flow into Express's normal error-handling middleware instead.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Req, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
