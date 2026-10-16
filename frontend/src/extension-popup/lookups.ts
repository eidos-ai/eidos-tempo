import type { Client, Project } from './types'

export interface Lookups {
  projects: Map<string, Project>
  clients: Map<string, Client>
}

export function buildLookups(projects: Project[], clients: Client[]): Lookups {
  return {
    projects: new Map(projects.map((project) => [project.id, project])),
    clients: new Map(clients.map((client) => [client.id, client])),
  }
}

export function clientOf(project: Project | undefined, lookups: Lookups): Client | undefined {
  return project?.client_id ? lookups.clients.get(project.client_id) : undefined
}
