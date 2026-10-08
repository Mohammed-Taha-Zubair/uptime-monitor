import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middlewares/validate";
import { incidentListQuerySchema } from "../schemas/incident.schema";
import { incidentService } from "../services/incident.service";

export const incidentsRouter = Router();

incidentsRouter.get(
  "/",
  validate(incidentListQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = (req.query.status as "all" | "open" | "resolved") || "all";
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const incidents = await incidentService.getAllIncidents(status, limit, offset);
      res.status(200).json(incidents);
    } catch (error) {
      next(error);
    }
  }
);
