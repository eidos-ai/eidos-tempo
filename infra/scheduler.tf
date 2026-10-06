# Nightly base backup + pg_dump. The backend checks the OIDC token's audience and service account.
resource "google_cloud_scheduler_job" "nightly_backup" {
  name             = "tempo-nightly-backup"
  region           = var.region
  schedule         = "0 3 * * *"
  time_zone        = "America/Montevideo"
  attempt_deadline = "600s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.tempo.uri}/api/internal/backup"

    oidc_token {
      service_account_email = module.base.scheduler_service_account
      audience              = local.backup_audience
    }
  }
}
