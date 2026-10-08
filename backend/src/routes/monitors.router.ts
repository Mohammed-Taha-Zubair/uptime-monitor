import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middlewares/validate";
import {
  createMonitorSchema,
  updateMonitorSchema,
  monitorIdParamSchema,
  metricsQuerySchema,
} from "../schemas/monitor.schema";
import { monitorService } from "../services/monitor.service";
import { incidentService } from "../services/incident.service";
import { probeService } from "../services/probe.service";
import { alertService } from "../services/alert.service";
import { config } from "../config";

export const monitorsRouter = Router();

// 1. Create a new monitor
monitorsRouter.post(
  "/",
  validate(createMonitorSchema, "body"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const monitor = await monitorService.createMonitor(req.body);
      res.status(201).json(monitor);
    } catch (error) {
      next(error);
    }
  }
);

// 2. List all monitors (optionally filter by user_id)
monitorsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query.user_id ? parseInt(req.query.user_id as string, 10) : undefined;
    const monitors = await monitorService.getAllMonitors(userId);
    res.status(200).json(monitors);
  } catch (error) {
    next(error);
  }
});

// 3. Get open incident for monitor (backward compatibility with original endpoint)
monitorsRouter.get(
  "/:id/open-incident",
  validate(monitorIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const incident = await incidentService.getOpenIncident(id);
      res.status(200).json({ incidents: incident });
    } catch (error) {
      next(error);
    }
  }
);

// 4. Get monitor by ID
monitorsRouter.get(
  "/:id",
  validate(monitorIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const monitor = await monitorService.getMonitorById(id);
      if (!monitor) {
        res.status(404).json({ error: "Monitor not found" });
        return;
      }
      res.status(200).json(monitor);
    } catch (error) {
      next(error);
    }
  }
);

// 5. Update monitor
monitorsRouter.patch(
  "/:id",
  validate(monitorIdParamSchema, "params"),
  validate(updateMonitorSchema, "body"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const updated = await monitorService.updateMonitor(id, req.body);
      if (!updated) {
        res.status(404).json({ error: "Monitor not found" });
        return;
      }
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }
);

// 6. Delete monitor
monitorsRouter.delete(
  "/:id",
  validate(monitorIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const deleted = await monitorService.deleteMonitor(id);
      if (!deleted) {
        res.status(404).json({ error: "Monitor not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// 7. Time-series metrics (sub-millisecond indexed query)
monitorsRouter.get(
  "/:id/metrics",
  validate(monitorIdParamSchema, "params"),
  validate(metricsQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const metrics = await monitorService.getMetrics(id, limit);
      res.status(200).json(metrics);
    } catch (error) {
      next(error);
    }
  }
);

// 8. Incident history for monitor
monitorsRouter.get(
  "/:id/incidents",
  validate(monitorIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const incidents = await incidentService.getIncidentsByMonitor(id);
      res.status(200).json(incidents);
    } catch (error) {
      next(error);
    }
  }
);

// 9. On-demand probe execution & state evaluation
monitorsRouter.post(
  "/:id/check",
  validate(monitorIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const monitor = await monitorService.getMonitorById(id);
      if (!monitor) {
        res.status(404).json({ error: "Monitor not found" });
        return;
      }

      const probeResult = await probeService.executeProbe(monitor.url, config.probeTimeoutMs);
      const evaluation = await alertService.processProbeResult(monitor, probeResult);

      res.status(200).json({
        monitorId: monitor.id,
        probe: probeResult,
        stateEvaluation: evaluation,
      });
    } catch (error) {
      next(error);
    }
  }
);
