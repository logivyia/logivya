export interface IncidentResponseRepository {
  revokeUserSessions(userId: string): Promise<number>;
  revokeCompanySessions(companyId: string): Promise<number>;
  revokeCompanyApiKeys(companyId: string): Promise<number>;
  pauseCompanyCampaigns(companyId: string): Promise<number>;
  disconnectCompanyAccounts(companyId: string): Promise<number>;
  createAuditLog(input: { companyId: string; userId?: string; action: string; entityType: string; metadata?: Record<string, unknown> }): Promise<void>;
}
export class IncidentResponseService {
  constructor(private readonly repository: IncidentResponseRepository) {}
  async lockdownCompany(companyId: string, actorUserId: string) {
    const [sessions, apiKeys, campaigns, accounts] = await Promise.all([
      this.repository.revokeCompanySessions(companyId), this.repository.revokeCompanyApiKeys(companyId),
      this.repository.pauseCompanyCampaigns(companyId), this.repository.disconnectCompanyAccounts(companyId),
    ]);
    await this.repository.createAuditLog({ companyId, userId: actorUserId, action: "company_security_lockdown", entityType: "Company", metadata: { sessions, apiKeys, campaigns, accounts } });
  }
}
