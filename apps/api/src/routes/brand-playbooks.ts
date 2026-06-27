import type { Express } from "express";
import { buildBrandPlaybookProfile } from "../insights/brand-playbook.js";
import type { Store } from "../store.js";
import { getDate } from "./http-utils.js";
import { validateQuery } from "./validation.js";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const brandPlaybookQuerySchema = z.object({
  categoryId: z.coerce.number().int().min(1),
  brand: z.string().min(1).max(200),
  date: dateSchema.optional(),
  windowDays: z.coerce.number().int().min(1).max(180).optional()
});

export function registerBrandPlaybookRoutes(app: Express, store: Store): void {
  app.get("/api/brand-playbooks", (request, response) => {
    const query = validateQuery(brandPlaybookQuerySchema, request.query);
    const profile = buildBrandPlaybookProfile(store, {
      categoryId: query.categoryId,
      brand: query.brand,
      date: query.date ?? getDate(request),
      windowDays: query.windowDays
    });
    if (!profile) {
      response.status(404).json({ message: "brand playbook profile not found" });
      return;
    }
    response.json(profile);
  });
}