import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { db } from "../db";
import {
  result_templates,
  result_template_parameters,
  results,
} from "../db/schema";
import { authenticate, requireRole } from "../middleware/auth";
import { createAuditLog } from "../middleware/audit";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import multer from "multer";

const router = Router();

// ─── Multer (memory storage for import) ──────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /json|csv/;
    if (allowed.test(file.mimetype) || allowed.test(file.originalname)) {
      return cb(null, true);
    }
    cb(new Error("Only JSON or CSV files are allowed"));
  },
});

// ─── Validation Schemas ───────────────────────────────────────────────────────

const parameterSchema = z.object({
  parameter_name: z.string().min(1).max(255),
  nis_limit: z.string().optional(),
  unit: z.string().max(50).optional(),
  parameter_group: z.string().max(100).optional(),
  sequence_order: z.number().int().default(0),
  data_type: z
    .enum(["numerical", "qualitative", "pass_fail"])
    .default("numerical"),
  spec_min: z.number().optional().nullable(),
  spec_max: z.number().optional().nullable(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  nis_standard: z.string().max(100).optional(),
  nis_standard_ref: z.string().min(1).max(100),
  effective_date: z.string().optional().nullable(),
  parameters: z.array(parameterSchema).min(1),
});

const patchTemplateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deactivate") }),
  z.object({
    action: z.literal("new_version"),
    name: z.string().min(1).max(255),
    nis_standard: z.string().max(100).optional(),
    nis_standard_ref: z.string().min(1).max(100),
    effective_date: z.string().optional().nullable(),
    parameters: z.array(parameterSchema).min(1),
  }),
]);

// ─── GET /result-templates ────────────────────────────────────────────────────
// Returns only the latest active version per template name, sorted alphabetically

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    // Get all active templates for tenant, then filter to latest version per name in JS
    const activeTemplates = await db
      .select({
        id: result_templates.id,
        name: result_templates.name,
        nis_standard_ref: result_templates.nis_standard_ref,
        version: result_templates.version,
        is_active: result_templates.is_active,
      })
      .from(result_templates)
      .where(
        and(
          eq(result_templates.tenant_id, req.tenantId!),
          eq(result_templates.is_active, true),
        ),
      )
      .orderBy(asc(result_templates.name), desc(result_templates.version));

    // Keep only the latest version per name
    const latestByName = new Map<string, (typeof activeTemplates)[0]>();
    for (const t of activeTemplates) {
      if (!latestByName.has(t.name)) {
        latestByName.set(t.name, t);
      }
    }

    const data = Array.from(latestByName.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    res.json({ data });
  } catch (error) {
    logger.error("Error fetching active templates:", error);
    throw error;
  }
});

// ─── GET /result-templates/all ────────────────────────────────────────────────
// All templates including inactive; requires quality_manager or md

router.get(
  "/all",
  authenticate,
  requireRole("quality_manager", "md", "super_admin"),
  async (req: Request, res: Response) => {
    try {
      const allTemplates = await db
        .select({
          id: result_templates.id,
          name: result_templates.name,
          nis_standard: result_templates.nis_standard,
          nis_standard_ref: result_templates.nis_standard_ref,
          effective_date: result_templates.effective_date,
          version: result_templates.version,
          parent_template_id: result_templates.parent_template_id,
          is_active: result_templates.is_active,
          created_at: result_templates.created_at,
        })
        .from(result_templates)
        .where(eq(result_templates.tenant_id, req.tenantId!))
        .orderBy(asc(result_templates.name), desc(result_templates.version));

      res.json({ data: allTemplates });
    } catch (error) {
      logger.error("Error fetching all templates:", error);
      throw error;
    }
  },
);

// ─── GET /result-templates/:id ────────────────────────────────────────────────

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const [template] = await db
      .select()
      .from(result_templates)
      .where(
        and(
          eq(result_templates.id, req.params.id),
          eq(result_templates.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!template) throw new AppError(404, "Template not found");

    const parameters = await db
      .select()
      .from(result_template_parameters)
      .where(eq(result_template_parameters.template_id, template.id))
      .orderBy(asc(result_template_parameters.sequence_order));

    res.json({ data: { ...template, parameters } });
  } catch (error) {
    logger.error("Error fetching template:", error);
    throw error;
  }
});

// ─── POST /result-templates ───────────────────────────────────────────────────

router.post(
  "/",
  authenticate,
  requireRole("quality_manager", "md", "super_admin"),
  async (req: Request, res: Response) => {
    const body = createTemplateSchema.parse(req.body);

    const result = await db.transaction(async (tx) => {
      const [newTemplate] = await tx
        .insert(result_templates)
        .values({
          tenant_id: req.tenantId!,
          name: body.name,
          nis_standard: body.nis_standard,
          nis_standard_ref: body.nis_standard_ref,
          effective_date: body.effective_date ?? null,
          version: 1,
          is_active: true,
          created_by: req.user!.id,
        })
        .returning();

      const paramRows = body.parameters.map((p) => ({
        template_id: newTemplate.id,
        parameter_name: p.parameter_name,
        nis_limit: p.nis_limit,
        unit: p.unit,
        parameter_group: p.parameter_group,
        sequence_order: p.sequence_order,
        data_type: p.data_type,
        spec_min: p.spec_min ?? null,
        spec_max: p.spec_max ?? null,
      }));

      const insertedParams = await tx
        .insert(result_template_parameters)
        .values(paramRows)
        .returning();

      return { ...newTemplate, parameters: insertedParams };
    });

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "result_templates",
      record_id: result.id,
      new_value: result as Record<string, unknown>,
    });

    res
      .status(201)
      .json({ data: result, message: "Template created successfully" });
  },
);

// ─── PATCH /result-templates/:id ─────────────────────────────────────────────

router.patch(
  "/:id",
  authenticate,
  requireRole("quality_manager", "md", "super_admin"),
  async (req: Request, res: Response) => {
    const body = patchTemplateSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(result_templates)
      .where(
        and(
          eq(result_templates.id, req.params.id),
          eq(result_templates.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Template not found");

    if (body.action === "deactivate") {
      const [updated] = await db
        .update(result_templates)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(result_templates.id, existing.id))
        .returning();

      await createAuditLog({
        tenant_id: req.tenantId!,
        user_id: req.user!.id,
        action: "UPDATE",
        table_name: "result_templates",
        record_id: existing.id,
        old_value: { is_active: true },
        new_value: { is_active: false },
        metadata: { action: "DEACTIVATE" },
      });

      return res.json({ data: updated, message: "Template deactivated" });
    }

    // action === "new_version"
    const result = await db.transaction(async (tx) => {
      // Deactivate the old template
      await tx
        .update(result_templates)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(result_templates.id, existing.id));

      // Insert new version
      const [newTemplate] = await tx
        .insert(result_templates)
        .values({
          tenant_id: req.tenantId!,
          name: body.name,
          nis_standard: body.nis_standard,
          nis_standard_ref: body.nis_standard_ref,
          effective_date: body.effective_date ?? null,
          version: (existing.version ?? 1) + 1,
          parent_template_id: existing.id,
          is_active: true,
          created_by: req.user!.id,
        })
        .returning();

      const paramRows = body.parameters.map((p) => ({
        template_id: newTemplate.id,
        parameter_name: p.parameter_name,
        nis_limit: p.nis_limit,
        unit: p.unit,
        parameter_group: p.parameter_group,
        sequence_order: p.sequence_order,
        data_type: p.data_type,
        spec_min: p.spec_min ?? null,
        spec_max: p.spec_max ?? null,
      }));

      const insertedParams = await tx
        .insert(result_template_parameters)
        .values(paramRows)
        .returning();

      return { ...newTemplate, parameters: insertedParams };
    });

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "result_templates",
      record_id: result.id,
      new_value: result as Record<string, unknown>,
      metadata: { action: "NEW_VERSION", previous_id: existing.id },
    });

    res
      .status(201)
      .json({ data: result, message: "New template version created" });
  },
);

// ─── DELETE /result-templates/:id ────────────────────────────────────────────

router.delete(
  "/:id",
  authenticate,
  requireRole("quality_manager", "md", "super_admin"),
  async (req: Request, res: Response) => {
    const [existing] = await db
      .select()
      .from(result_templates)
      .where(
        and(
          eq(result_templates.id, req.params.id),
          eq(result_templates.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!existing) throw new AppError(404, "Template not found");

    // Check if any results reference this template
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(results)
      .where(eq(results.template_id, existing.id));

    if (count > 0) {
      throw new AppError(
        409,
        `Template is in use by ${count} result(s). Deactivate it instead.`,
      );
    }

    await db
      .delete(result_templates)
      .where(eq(result_templates.id, existing.id));

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "DELETE",
      table_name: "result_templates",
      record_id: existing.id,
      old_value: existing as Record<string, unknown>,
    });

    res.json({ message: "Template deleted successfully" });
  },
);

// ─── POST /result-templates/import ───────────────────────────────────────────

router.post(
  "/import",
  authenticate,
  requireRole("quality_manager", "md", "super_admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError(400, "No file uploaded. Expected a 'file' field.");
    }

    const fileContent = req.file.buffer.toString("utf-8").trim();
    const filename = req.file.originalname.toLowerCase();

    let parsed: any;

    if (
      filename.endsWith(".json") ||
      req.file.mimetype === "application/json"
    ) {
      try {
        parsed = JSON.parse(fileContent);
      } catch {
        throw new AppError(400, "Invalid JSON file.");
      }
    } else if (
      filename.endsWith(".csv") ||
      req.file.mimetype === "text/csv" ||
      req.file.mimetype === "application/csv"
    ) {
      parsed = parseImportCsv(fileContent);
    } else {
      throw new AppError(400, "Invalid file format. Expected JSON or CSV.");
    }

    // Validate the parsed payload
    const validationResult = createTemplateSchema.safeParse(parsed);
    if (!validationResult.success) {
      const missingFields = validationResult.error.issues.map((i) =>
        i.path.join("."),
      );
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
        fields: missingFields,
      });
    }

    const body = validationResult.data;

    const result = await db.transaction(async (tx) => {
      const [newTemplate] = await tx
        .insert(result_templates)
        .values({
          tenant_id: req.tenantId!,
          name: body.name,
          nis_standard: body.nis_standard,
          nis_standard_ref: body.nis_standard_ref,
          effective_date: body.effective_date ?? null,
          version: 1,
          is_active: true,
          created_by: req.user!.id,
        })
        .returning();

      const paramRows = body.parameters.map((p) => ({
        template_id: newTemplate.id,
        parameter_name: p.parameter_name,
        nis_limit: p.nis_limit,
        unit: p.unit,
        parameter_group: p.parameter_group,
        sequence_order: p.sequence_order,
        data_type: p.data_type,
        spec_min: p.spec_min ?? null,
        spec_max: p.spec_max ?? null,
      }));

      const insertedParams = await tx
        .insert(result_template_parameters)
        .values(paramRows)
        .returning();

      return { ...newTemplate, parameters: insertedParams };
    });

    await createAuditLog({
      tenant_id: req.tenantId!,
      user_id: req.user!.id,
      action: "CREATE",
      table_name: "result_templates",
      record_id: result.id,
      new_value: result as Record<string, unknown>,
      metadata: { action: "IMPORT" },
    });

    res
      .status(201)
      .json({ data: result, message: "Template imported successfully" });
  },
);

// ─── CSV Parser ───────────────────────────────────────────────────────────────
// Parses a CSV where the first row is a header row for template metadata
// and subsequent rows are parameters.
//
// Expected CSV format:
// name,nis_standard,nis_standard_ref,effective_date
// Borehole Water,NIS 554,NIS-554-2015,2015-01-01
// parameter_name,nis_limit,unit,parameter_group,sequence_order,data_type,spec_min,spec_max
// pH,6.5 - 8.5,,Physical Tests,1,numerical,6.5,8.5

function parseImportCsv(content: string): any {
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 4) {
    throw new AppError(
      400,
      "CSV file is too short. Expected template header row, template data row, parameter header row, and at least one parameter row.",
    );
  }

  const templateHeaders = lines[0].split(",").map((h) => h.trim());
  const templateValues = lines[1].split(",").map((v) => v.trim());

  const templateRow: Record<string, string> = {};
  templateHeaders.forEach((h, i) => {
    templateRow[h] = templateValues[i] ?? "";
  });

  const paramHeaders = lines[2].split(",").map((h) => h.trim());
  const parameters: any[] = [];

  for (let i = 3; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    const param: Record<string, any> = {};
    paramHeaders.forEach((h, j) => {
      param[h] = vals[j] ?? "";
    });

    parameters.push({
      parameter_name: param["parameter_name"],
      nis_limit: param["nis_limit"] || undefined,
      unit: param["unit"] || undefined,
      parameter_group: param["parameter_group"] || undefined,
      sequence_order: param["sequence_order"]
        ? parseInt(param["sequence_order"])
        : 0,
      data_type: param["data_type"] || "numerical",
      spec_min: param["spec_min"] ? parseFloat(param["spec_min"]) : undefined,
      spec_max: param["spec_max"] ? parseFloat(param["spec_max"]) : undefined,
    });
  }

  return {
    name: templateRow["name"],
    nis_standard: templateRow["nis_standard"] || undefined,
    nis_standard_ref: templateRow["nis_standard_ref"],
    effective_date: templateRow["effective_date"] || undefined,
    parameters,
  };
}

export default router;
