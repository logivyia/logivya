export type ActivityFeedInput = {
  companyId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  title: string;
  metadata?: Record<string, unknown>;
};
export interface ActivityFeedRepository {
  create(input: ActivityFeedInput): Promise<void>;
}
export class ActivityFeedService {
  constructor(private readonly repository: ActivityFeedRepository) {}
  record(input: ActivityFeedInput) { return this.repository.create(input); }
}
