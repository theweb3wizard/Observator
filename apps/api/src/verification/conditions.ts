// Condition schemas — Observator V1 verification contract.
// Spec §§9, 29. Discriminated union; validated with Zod at job creation
// (backend) and re-validated here before execution. Deterministic only:
// no LLM output may add, remove, or override a condition.
import { z } from "zod";

export const HttpStatusConditionSchema = z.object({
  type: z.literal("http_status"),
  expected: z.number().int().min(100).max(599),
});

export const RequiredFieldsConditionSchema = z.object({
  type: z.literal("required_fields"),
  fields: z.array(z.string().min(1)).min(1).max(64),
});

export const JsonSchemaConditionSchema = z.object({
  type: z.literal("json_schema"),
  // Arbitrary JSON Schema object; validated/executed by Ajv in the engine.
  schema: z.record(z.string(), z.unknown()),
});

export const MaxAgeConditionSchema = z.object({
  type: z.literal("max_age_seconds"),
  field: z.string().min(1).default("timestamp"),
  max: z.number().positive(),
});

export const MaxLatencyConditionSchema = z.object({
  type: z.literal("max_latency_ms"),
  max: z.number().positive(),
});

export const ConditionSchema = z.discriminatedUnion("type", [
  HttpStatusConditionSchema,
  RequiredFieldsConditionSchema,
  JsonSchemaConditionSchema,
  MaxAgeConditionSchema,
  MaxLatencyConditionSchema,
]);

export type Condition = z.infer<typeof ConditionSchema>;

// Deadline (Check E) is job-level, not a per-condition entry: the engine
// always evaluates delivery-time <= deadline from the job record.
export const DeadlineSchema = z.string().datetime();
