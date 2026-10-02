import { tempoApi } from './api'
import { showProblem, showRunning } from './badge'

const REFRESH_ALARM = 'refresh-badge'
const REFRESH_MINUTES = 1

async function refreshBadge(): Promise<void> {
  try {
    await showRunning(await tempoApi.running())
  } catch {
    await showProblem()
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES })
  void refreshBadge()
})

chrome.runtime.onStartup.addListener(() => void refreshBadge())

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refreshBadge()
})
