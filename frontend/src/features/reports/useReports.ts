import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { reportsApi } from '../../api/endpoints'
import { queryKeys } from '../../api/queryKeys'
import type { ReportKind, User } from '../../api/types'
import { showToast } from '../../lib/toast'
import { useCurrentUser } from '../auth/useAuth'
import { useMembers } from '../members/useMembers'
import { presetLabel, toApiQuery, toSummaryQuery, type ReportFilters } from './reportFilters'

export function useSummaryReport(filters: ReportFilters) {
  const query = toSummaryQuery(filters)
  return useQuery({
    queryKey: queryKeys.reportSummary(query),
    queryFn: () => reportsApi.summary(query),
    placeholderData: (previous) => previous,
  })
}

export function useReportEntries(filters: ReportFilters) {
  const query = toApiQuery(filters)
  return useQuery({
    queryKey: queryKeys.reportEntryList(query),
    queryFn: () => reportsApi.entries(query),
    placeholderData: (previous) => previous,
  })
}

export function useMemberLookup(): Map<string, User> {
  const currentUser = useCurrentUser()
  const isAdmin = currentUser.role === 'admin'
  const { data } = useMembers(isAdmin)
  return useMemo(
    () => new Map((isAdmin ? (data ?? []) : [currentUser]).map((user) => [user.id, user])),
    [isAdmin, data, currentUser],
  )
}

function pdfQuery(filters: ReportFilters): string {
  const periodName = presetLabel(filters.from, filters.to)
  const query = toSummaryQuery(filters)
  return periodName ? `${query}&period_name=${encodeURIComponent(periodName)}` : query
}

function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}

export function useExportPdf() {
  return useMutation({
    mutationFn: ({ kind, filters }: { kind: ReportKind; filters: ReportFilters }) =>
      reportsApi.pdf(kind, pdfQuery(filters)),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
    onError: (error) => showToast(`The PDF could not be exported: ${error.message}`),
  })
}
