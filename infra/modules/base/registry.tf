resource "google_artifact_registry_repository" "tempo" {
  repository_id = "tempo"
  location      = var.region
  format        = "DOCKER"
  description   = "Eidos Tempo images (web, backend, db)"
  labels        = var.labels

  cleanup_policies {
    id     = "keep-10-newest"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "0s"
    }
  }
}
