import { z } from 'zod';

export const MonitorTypeSchema = z.enum(['http', 'tcp']);

export const ValidationSchema = z.object({
  status: z.union([z.number(), z.array(z.number())]).optional(),
  body_match: z.string().optional(), // Regex string
  headers_match: z.record(z.string()).optional(),
});

export const DisplaySchema = z.object({
  chart: z.boolean().default(true),
  history: z.boolean().default(true),
  public_link: z.boolean().default(false),
});

export const MonitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: MonitorTypeSchema,
  url: z.string(),
  method: z.string().default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeout: z.number().default(5000),
  expected_latency: z.number().default(1000),
  grace_period: z.number().default(3),
  tags: z.array(z.string()).optional(),
  display: DisplaySchema.default({}),
  validation: ValidationSchema.optional(),
});

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  monitors: z.array(MonitorSchema),
});

export const ConfigSchema = z.object({
  settings: z.object({
    title: z.string(),
    logo: z.string().optional(),
    callback_url: z.string().optional(),
    callback_secret: z.string().optional(),
    notification_on_down_only: z.boolean().default(false),
  }),
  groups: z.array(GroupSchema),
});

export type Monitor = z.infer<typeof MonitorSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// Database Types
export interface MonitorState {
  monitor_id: string;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  last_checked_at: number;
  last_latency: number;
  fail_count: number;
  first_fail_time: number | null;
  last_error?: string | null;
}

export interface CheckHistory {
  id?: number;
  monitor_id: string;
  timestamp: number;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  latency: number;
  message: string | null;
}
