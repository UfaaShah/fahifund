import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AppNotification,
  AuditLogRow,
  FortuneSwapRequest,
  FundDetail,
  FundOverview,
  MonthSummary,
} from "./types";

export function useFunds() {
  return useQuery({ queryKey: ["funds"], queryFn: () => api.get<FundOverview[]>("/funds") });
}

export function useFund(fundId?: string) {
  return useQuery({
    queryKey: ["fund", fundId],
    queryFn: () => api.get<FundDetail>(`/funds/${fundId}`),
    enabled: !!fundId,
  });
}

export function useFundTimeline(fundId?: string) {
  return useQuery({
    queryKey: ["fund-timeline", fundId],
    queryFn: () => api.get<MonthSummary[]>(`/funds/${fundId}/timeline`),
    enabled: !!fundId,
  });
}

export function useMonth(fundId?: string, monthNumber?: number | null) {
  return useQuery({
    queryKey: ["fund-month", fundId, monthNumber],
    queryFn: () => api.get<MonthSummary>(`/funds/${fundId}/months/${monthNumber}`),
    enabled: !!fundId && !!monthNumber,
  });
}

export function useCurrentPayout(fundId?: string) {
  return useQuery({
    queryKey: ["current-payout", fundId],
    queryFn: () => api.get<MonthSummary & { fundCompleted?: boolean }>(`/funds/${fundId}/payouts/current`),
    enabled: !!fundId,
  });
}

export function usePayoutHistory(fundId?: string) {
  return useQuery({
    queryKey: ["payout-history", fundId],
    queryFn: () => api.get<any[]>(`/funds/${fundId}/payouts`),
    enabled: !!fundId,
  });
}

export function useFortuneSwaps(fundId?: string) {
  return useQuery({
    queryKey: ["fortune-swaps", fundId],
    queryFn: () => api.get<FortuneSwapRequest[]>(`/funds/${fundId}/fortune-swaps`),
    enabled: !!fundId,
  });
}

export function useMyPayments(fundId?: string) {
  return useQuery({
    queryKey: ["my-payments", fundId],
    queryFn: () => api.get<any[]>(`/funds/${fundId}/payments/mine`),
    enabled: !!fundId,
  });
}

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: () => api.get<AppNotification[]>("/notifications") });
}

export function useAuditLogs(fundId?: string) {
  return useQuery({
    queryKey: ["audit-logs", fundId],
    queryFn: () => api.get<AuditLogRow[]>(`/audit-logs${fundId ? `?fundId=${fundId}` : ""}`),
  });
}

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<any[]>("/users") });
}

export function useSuperAdminDashboard() {
  return useQuery({ queryKey: ["dashboard-super-admin"], queryFn: () => api.get<any>("/dashboard/super-admin") });
}

/** Invalidate every query touching a given fund after a mutation. */
export function useInvalidateFund() {
  const qc = useQueryClient();
  return (fundId: string) => {
    qc.invalidateQueries({ queryKey: ["fund", fundId] });
    qc.invalidateQueries({ queryKey: ["funds"] });
    qc.invalidateQueries({ queryKey: ["fund-timeline", fundId] });
    qc.invalidateQueries({ queryKey: ["fund-month", fundId] });
    qc.invalidateQueries({ queryKey: ["current-payout", fundId] });
    qc.invalidateQueries({ queryKey: ["payout-history", fundId] });
    qc.invalidateQueries({ queryKey: ["my-payments", fundId] });
    qc.invalidateQueries({ queryKey: ["fortune-swaps", fundId] });
    qc.invalidateQueries({ queryKey: ["audit-logs"] });
    qc.invalidateQueries({ queryKey: ["dashboard-super-admin"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useApiMutation<TArgs, TResult = any>(fn: (args: TArgs) => Promise<TResult>) {
  return useMutation({ mutationFn: fn });
}
