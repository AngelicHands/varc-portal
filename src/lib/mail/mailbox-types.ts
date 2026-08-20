import type { EmailJobKind } from "@/lib/mail/job-types";

export type MailMessageStatus = "sent" | "failed";

export type AdminMailMessageListItem = {
  id: string;
  to: string;
  from: string;
  subject: string;
  status: MailMessageStatus;
  kind: EmailJobKind;
  formNameSnapshot: string;
  formId: string | null;
  submissionId: string | null;
  createdAt: string | null;
};
