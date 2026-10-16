import '../styles.css'
import { showProblem, showRunning } from '../badge'
import { getServerUrl } from '../config'
import type { ShellMessage } from './messages'

const READY_TIMEOUT_MS = 10_000
const POPUP_PATH = '/extension-popup.html'

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Popup markup is missing #${id}`)
  return found as T
}

const frame = element<HTMLIFrameElement>('tempo')
const loading = element('loading')
const unreachable = element('unreachable')
const unreachableMessage = element('unreachable-message')

async function openTempo(serverUrl: string): Promise<void> {
  await chrome.tabs.create({ url: serverUrl })
  window.close()
}

function handle(message: ShellMessage, serverUrl: string): void {
  switch (message.type) {
    case 'ready':
      loading.hidden = true
      unreachable.hidden = true
      frame.hidden = false
      return
    case 'running':
      void showRunning(message.entry)
      return
    case 'problem':
      void showProblem()
      return
    case 'open-tempo':
      void openTempo(serverUrl)
      return
    case 'open-settings':
      void chrome.runtime.openOptionsPage()
      return
  }
}

function load(serverUrl: string): void {
  loading.hidden = false
  unreachable.hidden = true
  frame.hidden = true
  frame.src = `${serverUrl}${POPUP_PATH}`
  window.setTimeout(() => {
    if (!frame.hidden) return
    loading.hidden = true
    unreachable.hidden = false
    unreachableMessage.textContent = `Can't reach Eidos Tempo at ${serverUrl}.`
    void showProblem()
  }, READY_TIMEOUT_MS)
}

async function start(): Promise<void> {
  const serverUrl = await getServerUrl()
  const serverOrigin = new URL(serverUrl).origin
  window.addEventListener('message', (event: MessageEvent<ShellMessage>) => {
    if (event.origin !== serverOrigin || event.source !== frame.contentWindow) return
    handle(event.data, serverUrl)
  })
  element('retry').addEventListener('click', () => load(serverUrl))
  element('settings').addEventListener('click', () => void chrome.runtime.openOptionsPage())
  load(serverUrl)
}

void start()
