import { z } from 'zod';

export const changelogItemSchema = z.object({
  field: z.string().optional(),
  fieldId: z.string().optional(),
  from: z.string().nullable().optional(),
  fromString: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

export const jiraWebhookSchema = z.object({
  timestamp: z.number().optional(),
  webhookEvent: z.string().optional(),
  issue: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      key: z.string(),
      fields: z
        .object({
          summary: z.string().nullable().optional(),
          project: z.object({ key: z.string().optional() }).optional(),
          status: z
            .object({
              id: z.union([z.string(), z.number()]).optional(),
              name: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  changelog: z
    .object({
      items: z.array(changelogItemSchema).optional(),
    })
    .optional(),
});

export type JiraWebhookPayload = z.infer<typeof jiraWebhookSchema>;
export type ChangelogItem = z.infer<typeof changelogItemSchema>;

export interface StatusTransition {
  jiraIssueId: string;
  issueKey: string;
  projectKey: string;
  summary: string | null;
  fromStatusId: string | null;
  fromStatusName: string | null;
  toStatusId: string | null;
  toStatusName: string;
  occurredAt: Date;
}
