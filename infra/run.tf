# One instance runs three containers that share localhost and two in-memory volumes:
# web (nginx, the only one receiving traffic) -> backend (FastAPI) -> db (Postgres + WAL-G).
# Images are set by scripts/cloudrun-deploy.sh; Terraform only uses :latest when creating the service.
locals {
  backup_audience = "eidos-tempo-nightly-backup"

  instance_env = {
    TEMPO_BUCKET        = var.bucket
    TEMPO_BACKUP_PREFIX = var.backup_prefix
  }
}

resource "google_cloud_run_v2_service" "tempo" {
  name                = "tempo"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels
  # Lets Cloud Run accept the scheduler's token (audience below) when the service is not public.
  custom_audiences = [local.backup_audience]

  template {
    service_account                  = module.base.runtime_service_account
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "300s"
    max_instance_request_concurrency = 80
    labels                           = local.labels

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    volumes {
      name = "pgdata"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "256Mi"
      }
    }

    volumes {
      name = "run"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "8Mi"
      }
    }

    containers {
      name       = "web"
      image      = "${local.registry}/web:latest"
      depends_on = ["backend"]

      ports {
        container_port = 8080
      }

      resources {
        limits            = { cpu = "0.1", memory = "128Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }

    containers {
      name    = "backend"
      image   = "${local.registry}/backend:latest"
      command = ["./cloudrun-start.sh"]

      resources {
        limits            = { cpu = "0.5", memory = "448Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = merge(local.instance_env, {
          TEMPO_DATABASE_URL        = "postgresql+psycopg://tempo@/tempo?host=/run/tempo"
          TEMPO_DURABLE_WRITES      = "true"
          TEMPO_BACKUP_AUDIENCE     = local.backup_audience
          TEMPO_BACKUP_CALLER_EMAIL = module.base.scheduler_service_account
          TEMPO_ENABLE_API_DOCS     = "false"
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      volume_mounts {
        name       = "pgdata"
        mount_path = "/var/lib/postgresql/data"
      }
      volume_mounts {
        name       = "run"
        mount_path = "/run/tempo"
      }

      # Passes only after the lease grace period, the restore and the migrations (up to 4 minutes).
      startup_probe {
        http_get {
          path = "/api/health"
          port = 8000
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 48
      }
    }

    containers {
      name  = "db"
      image = "${local.registry}/db:latest"

      resources {
        limits            = { cpu = "0.4", memory = "448Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.instance_env
        content {
          name  = env.key
          value = env.value
        }
      }

      volume_mounts {
        name       = "pgdata"
        mount_path = "/var/lib/postgresql/data"
      }
      volume_mounts {
        name       = "run"
        mount_path = "/run/tempo"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[1].image,
      template[0].containers[2].image,
      client,
      client_version,
    ]
  }
}
