import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

type RequestLocation = "body" | "params" | "query";

export function validate(schema: ZodSchema, location: RequestLocation = "body") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req[location]);
      if (location === "body") {
        req.body = parsed;
      } else if (req[location] && typeof req[location] === "object") {
        Object.assign(req[location], parsed);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}
