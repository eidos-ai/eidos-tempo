export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  clients: ['clients'] as const,
  projects: ['projects'] as const,
  timeEntries: ['time-entries'] as const,
  runningEntry: ['time-entries', 'running'] as const,
  weekEntries: ['time-entries', 'week'] as const,
  week: (weekStart: Date) => ['time-entries', 'week', weekStart.toISOString()] as const,
}
