export type SafetyProfile = {
  trustScore: number;
  dailyLimit: number;
  hourlyLimit: number;
  minDelayMs: number;
  maxDelayMs: number;
  warningCount: number;
  cooldownUntil?: Date | null;
  suspendedAt?: Date | null;
};
export type SafetyUsage = { sentToday: number; sentThisHour: number };
export type SafetyDecision = { allowed: boolean; delayMs: number; reason?: string; suspendCampaign?: boolean };

export function evaluateSafety(profile: SafetyProfile, usage: SafetyUsage, now = new Date()): SafetyDecision {
  if (profile.suspendedAt) return { allowed: false, delayMs: 0, reason: "Account is suspended", suspendCampaign: true };
  if (profile.cooldownUntil && profile.cooldownUntil > now) return { allowed: false, delayMs: profile.cooldownUntil.getTime() - now.getTime(), reason: "Account cooldown is active" };
  if (usage.sentToday >= profile.dailyLimit) return { allowed: false, delayMs: 0, reason: "Daily safety limit reached", suspendCampaign: true };
  if (usage.sentThisHour >= profile.hourlyLimit) return { allowed: false, delayMs: 60_000, reason: "Hourly safety limit reached" };
  const riskMultiplier = profile.warningCount > 0 ? Math.min(profile.warningCount + 1, 4) : 1;
  const range = Math.max(profile.maxDelayMs - profile.minDelayMs, 0);
  return { allowed: true, delayMs: Math.round((profile.minDelayMs + Math.random() * range) * riskMultiplier) };
}
