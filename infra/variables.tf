variable "project" {
  type    = string
  default = "eidos-15111991"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "bucket" {
  type    = string
  default = "eidos-tempo"
}

variable "backup_prefix" {
  description = "Backup set the service starts from and writes to: gs://<bucket>/backups/<backup_prefix>/"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*$", var.backup_prefix))
    error_message = "Use lowercase letters, digits and dashes, e.g. smoke or prod-2026-10-17."
  }
}

variable "alert_email" {
  description = "Receives the uptime and backup alerts"
  type        = string
}
