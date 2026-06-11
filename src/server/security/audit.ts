export type ImmutableAuditEntry = {
  companyId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};
export interface ImmutableAuditRepository {
  append(entry: ImmutableAuditEntry): Promise<void>;
}
export class AuditService {
  constructor(private readonly repository: ImmutableAuditRepository) {}
  record(entry: ImmutableAuditEntry) { return this.repository.append(entry); }
}
