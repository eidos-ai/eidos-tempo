# Exactly two alert conditions (1.50 USD/month each). The uptime check and the log metric are free.
resource "google_monitoring_notification_channel" "email" {
  display_name = "Eidos Tempo alerts"
  type         = "email"
  labels       = { email_address = var.alert_email }
  user_labels  = local.labels
}

resource "google_monitoring_uptime_check_config" "tempo" {
  display_name = "Eidos Tempo health"
  timeout      = "10s"
  period       = "300s"
  user_labels  = local.labels

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project
      host       = trimprefix(google_cloud_run_v2_service.tempo.uri, "https://")
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  display_name          = "Eidos Tempo is down"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = local.labels

  conditions {
    display_name = "Uptime check failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.tempo.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "600s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }
}

resource "google_logging_metric" "backup_finished" {
  name   = "tempo-backup-finished"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"tempo\" AND textPayload:\"Nightly backup finished\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "backup_missing" {
  display_name          = "Eidos Tempo nightly backup missing"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = local.labels

  conditions {
    display_name = "No backup in 23 hours"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.backup_finished.name}\" AND resource.type=\"cloud_run_revision\""
      duration = "82800s"
      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_COUNT"
      }
    }
  }
}
