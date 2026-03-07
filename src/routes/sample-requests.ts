import { Router, Request, Response } from "express";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { sample_requests, clients, users, samples } from "../db/schema";
import { authenticate, requireRole, STAFF_ROLES } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import {
  sendRequestConfirmation,
  sendRequestApprovalEmail,
} from "../services/emailService";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createRequestSchema = z.object({
  client_id: z.string().uuid().optional(),
  // Client info (for new clients via public form)
  client_name: z.string().optional(),
  client_company: z.string().optional(),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  client_address: z.string().optional(),
  // Representative
  representative_name: z.string().optional(),
  representative_phone: z.string().optional(),
  representative_email: z.string().email().optional().or(z.literal("")),
  // Sample Information
  product_name: z.string().optional(),
  sample_source: z.string().optional(),
  sample_type: z.string().optional(),
  production_date: z.string().optional(), // Changed from datetime
  expiry_date: z.string().optional(), // Changed from datetime
  batch_number: z.string().optional(),
  // Analysis
  intended_use: z.string().optional(),
  reference_standard: z.string().optional(),
  test_category: z.string().optional(),
  test_category_other: z.string().optional(),
  requested_tests: z.array(z.string()).optional(),
  // Additional
  sample_container: z.string().optional(),
  sample_volume: z.string().optional(),
  sample_condition: z.string().optional(),
  temperature_on_receipt: z.string().optional(),
  sampling_point: z.string().optional(),
  manufacturer: z.string().optional(),
  matrix: z.string().optional(),
});

const updateRequestSchema = z.object({
  status: z
    .enum([
      "pending",
      "under_review",
      "approved",
      "rejected",
      "sample_received",
      "completed",
      "cancelled",
    ])
    .optional(),
  rejection_reason: z.string().optional(),
  quotation_amount: z.number().optional(),
  // Official use fields
  reference_standard_available: z.boolean().optional(),
  service_offered: z.boolean().optional(),
  test_resources_available: z.boolean().optional(),
  sample_quantity_sufficient: z.boolean().optional(),
  invoice_issued: z.boolean().optional(),
  payment_confirmed: z.boolean().optional(),
  official_remarks: z.string().optional(),
});

// ─── Helper: Generate Request Number ─────────────────────────────────────────

async function generateRequestNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");

  const lastRequest = await db
    .select({ request_number: sample_requests.request_number })
    .from(sample_requests)
    .where(
      and(
        eq(sample_requests.tenant_id, tenantId),
        sql`${sample_requests.request_number} LIKE ${`CRF${year}${month}-%`}`,
      ),
    )
    .orderBy(desc(sample_requests.created_at))
    .limit(1);

  let sequence = 1;
  if (lastRequest.length > 0) {
    const lastNum = lastRequest[0].request_number.split("-")[1];
    sequence = parseInt(lastNum) + 1;
  }

  return `CRF${year}${month}-${String(sequence).padStart(4, "0")}`;
}

// ─── POST /sample-requests (PUBLIC) ──────────────────────────────────────────

router.post("/public", async (req: Request, res: Response) => {
  try {
    const body = createRequestSchema.parse(req.body);

    // Get tenant_id from request or use first available tenant
    let tenantId = req.body.tenant_id;

    if (!tenantId) {
      // Get the first tenant from database
      const { tenants } = await import("../db/schema");
      const [firstTenant] = await db.select().from(tenants).limit(1);

      if (!firstTenant) {
        throw new AppError(
          500,
          "No tenant configured. Please contact administrator.",
        );
      }

      tenantId = firstTenant.id;
    }

    // Create or find client
    let clientId = body.client_id;

    if (!clientId && body.client_email) {
      // Check if client exists
      const existingClient = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.tenant_id, tenantId),
            eq(clients.email, body.client_email),
          ),
        )
        .limit(1);

      if (existingClient.length > 0) {
        clientId = existingClient[0].id;
      } else {
        // Create new client
        const [newClient] = await db
          .insert(clients)
          .values({
            tenant_id: tenantId,
            name: body.client_name || "Walk-in Customer",
            company: body.client_company,
            email: body.client_email,
            phone: body.client_phone,
            address: body.client_address,
          })
          .returning();
        clientId = newClient.id;
      }
    }

    if (!clientId) {
      throw new AppError(400, "Client information required");
    }

    const requestNumber = await generateRequestNumber(tenantId);

    // Convert date strings to Date objects if provided (not ISO strings)
    const productionDate = body.production_date
      ? new Date(body.production_date)
      : undefined;
    const expiryDate = body.expiry_date
      ? new Date(body.expiry_date)
      : undefined;

    const [request] = await db
      .insert(sample_requests)
      .values({
        tenant_id: tenantId,
        request_number: requestNumber,
        client_id: clientId,
        representative_name: body.representative_name,
        representative_phone: body.representative_phone,
        representative_email: body.representative_email,
        product_name: body.product_name,
        sample_source: body.sample_source,
        sample_type: body.sample_type,
        production_date: productionDate,
        expiry_date: expiryDate,
        batch_number: body.batch_number,
        intended_use: body.intended_use,
        reference_standard: body.reference_standard,
        test_category: body.test_category,
        test_category_other: body.test_category_other,
        requested_tests: body.requested_tests || [],
        sample_container: body.sample_container,
        sample_volume: body.sample_volume,
        sample_condition: body.sample_condition,
        temperature_on_receipt: body.temperature_on_receipt,
        sampling_point: body.sampling_point,
        manufacturer: body.manufacturer,
        matrix: body.matrix,
        status: "pending",
      })
      .returning();

    logger.info(`Public sample request created: ${requestNumber}`);

    // Send confirmation emails (don't wait for completion)
    sendRequestConfirmation({
      requestNumber,
      clientName: body.client_name || "Customer",
      clientEmail: body.client_email!,
      representativeName: body.representative_name,
      representativeEmail: body.representative_email,
      productName: body.product_name || "Sample",
      testCategory: body.test_category || "general",
    }).catch((err) => logger.error("Email send failed:", err));

    res.status(201).json({
      success: true,
      data: request,
      message: `Request ${requestNumber} submitted successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      logger.error("Validation error:", {
        field: firstError.path,
        message: firstError.message,
      });
      throw new AppError(
        400,
        `${firstError.path.join(".")}: ${firstError.message}`,
      );
    }
    throw error;
  }
});

// ─── GET /sample-requests ─────────────────────────────────────────────────────

router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "25",
      status,
      search,
      client_id,
    } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [eq(sample_requests.tenant_id, req.tenantId!)];

    if (status) conditions.push(eq(sample_requests.status, status as any));
    if (client_id) conditions.push(eq(sample_requests.client_id, client_id));
    if (search) {
      conditions.push(
        sql`(${sample_requests.request_number} ILIKE ${"%" + search + "%"} OR ${sample_requests.product_name} ILIKE ${"%" + search + "%"})`,
      );
    }

    const [requestList, [{ count }]] = await Promise.all([
      db
        .select({
          id: sample_requests.id,
          request_number: sample_requests.request_number,
          product_name: sample_requests.product_name,
          status: sample_requests.status,
          test_category: sample_requests.test_category,
          quotation_amount: sample_requests.quotation_amount,
          payment_confirmed: sample_requests.payment_confirmed,
          created_at: sample_requests.created_at,
          client: {
            id: clients.id,
            name: clients.name,
            company: clients.company,
          },
          sample: {
            id: samples.id,
            ulid: samples.ulid,
          },
        })
        .from(sample_requests)
        .leftJoin(clients, eq(sample_requests.client_id, clients.id))
        .leftJoin(samples, eq(sample_requests.sample_id, samples.id))
        .where(and(...conditions))
        .orderBy(desc(sample_requests.created_at))
        .limit(parseInt(limit))
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sample_requests)
        .where(and(...conditions)),
    ]);

    res.json({
      success: true,
      data: requestList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    throw error;
  }
});

// ─── GET /sample-requests/:id ─────────────────────────────────────────────────

router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const [request] = await db
      .select({
        request: sample_requests,
        client: clients,
        received_by_user: users,
        sample: samples,
      })
      .from(sample_requests)
      .leftJoin(clients, eq(sample_requests.client_id, clients.id))
      .leftJoin(users, eq(sample_requests.received_by, users.id))
      .leftJoin(samples, eq(sample_requests.sample_id, samples.id))
      .where(
        and(
          eq(sample_requests.id, req.params.id),
          eq(sample_requests.tenant_id, req.tenantId!),
        ),
      )
      .limit(1);

    if (!request) {
      throw new AppError(404, "Request not found");
    }

    res.json({
      success: true,
      data: {
        ...request.request,
        client: request.client,
        received_by: request.received_by_user,
        sample: request.sample,
      },
    });
  } catch (error) {
    throw error;
  }
});

// ─── PUT /sample-requests/:id ─────────────────────────────────────────────────

router.put(
  "/:id",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    try {
      const body = updateRequestSchema.parse(req.body);

      const updateData: any = { ...body, updated_at: new Date() };

      if (body.status === "under_review") {
        updateData.reviewed_by = req.user!.id;
        updateData.reviewed_at = new Date();
      }

      if (body.status === "approved") {
        updateData.approved_by = req.user!.id;
        updateData.approved_at = new Date();
      }

      const [updated] = await db
        .update(sample_requests)
        .set(updateData)
        .where(
          and(
            eq(sample_requests.id, req.params.id),
            eq(sample_requests.tenant_id, req.tenantId!),
          ),
        )
        .returning();

      if (!updated) {
        throw new AppError(404, "Request not found");
      }

      logger.info(
        `Sample request updated: ${updated.request_number} by ${req.user!.id}`,
      );

      // Send approval email if status changed to approved
      if (body.status === "approved" && body.quotation_amount) {
        const [requestWithClient] = await db
          .select({
            request: sample_requests,
            client: clients,
          })
          .from(sample_requests)
          .leftJoin(clients, eq(sample_requests.client_id, clients.id))
          .where(eq(sample_requests.id, req.params.id))
          .limit(1);

        if (requestWithClient?.client?.email) {
          sendRequestApprovalEmail({
            requestNumber: updated.request_number,
            clientName: requestWithClient.client.name,
            clientEmail: requestWithClient.client.email,
            quotationAmount: body.quotation_amount,
          }).catch((err) => logger.error("Approval email failed:", err));
        }
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError(400, error.errors[0].message);
      }
      throw error;
    }
  },
);

// ─── POST /sample-requests/:id/convert-to-sample ──────────────────────────────

router.post(
  "/:id/convert-to-sample",
  authenticate,
  requireRole(...STAFF_ROLES),
  async (req: Request, res: Response) => {
    try {
      const [request] = await db
        .select()
        .from(sample_requests)
        .where(
          and(
            eq(sample_requests.id, req.params.id),
            eq(sample_requests.tenant_id, req.tenantId!),
          ),
        )
        .limit(1);

      if (!request) {
        throw new AppError(404, "Request not found");
      }

      if (request.sample_id) {
        throw new AppError(400, "Request already converted to sample");
      }

      // Generate ULID for sample
      const { generateULID } = await import("../services/barcodeService");
      const ulid = generateULID();

      // Create sample from request
      const [sample] = await db
        .insert(samples)
        .values({
          tenant_id: req.tenantId!,
          ulid,
          client_id: request.client_id,
          name: request.product_name || "Sample from Request",
          description: request.intended_use,
          matrix: request.matrix,
          collection_date: request.production_date,
          storage_location: req.body.storage_location,
          assigned_analyst_id: req.body.assigned_analyst_id,
          sample_container: request.sample_container,
          sample_volume: request.sample_volume,
          reference_standard: request.reference_standard,
          batch_number: request.batch_number,
          sample_condition: request.sample_condition,
          temperature_on_receipt: request.temperature_on_receipt,
          sampling_point: request.sampling_point,
          production_date: request.production_date,
          expiry_date: request.expiry_date,
          manufacturer: request.manufacturer,
          received_by: req.user!.id,
          status: "received",
        })
        .returning();

      // Update request with sample_id
      await db
        .update(sample_requests)
        .set({
          sample_id: sample.id,
          status: "sample_received",
          updated_at: new Date(),
        })
        .where(eq(sample_requests.id, req.params.id));

      logger.info(
        `Request ${request.request_number} converted to sample ${ulid}`,
      );

      res.json({
        success: true,
        data: sample,
        message: `Sample ${ulid} created successfully`,
      });
    } catch (error) {
      throw error;
    }
  },
);

export default router;
