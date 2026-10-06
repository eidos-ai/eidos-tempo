# One bucket: backups/<prefix>/ (WAL-G and nightly dumps), lease/owner (which instance owns the database),
# tfstate/ (Terraform). Created by hand in the guide's step A5 and adopted with the import in main.tf.
resource "google_storage_bucket" "tempo" {
  name                        = var.bucket
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  soft_delete_policy {
    retention_duration_seconds = 60 * 24 * 60 * 60
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = 180
      matches_prefix = ["backups/"]
    }
  }

  lifecycle {
    prevent_destroy = true
    # Encryption is Google's default (set at creation); leave it as it is.
    ignore_changes = [encryption]
  }
}

locals {
  objects = "projects/_/buckets/${var.bucket}/objects"
  runtime = "serviceAccount:${google_service_account.runtime.email}"
}

# The runtime may add and read backups but never delete or overwrite them.
resource "google_storage_bucket_iam_member" "runtime_creates_backups" {
  bucket = google_storage_bucket.tempo.name
  role   = "roles/storage.objectCreator"
  member = local.runtime

  condition {
    title      = "backups-only"
    expression = "resource.name.startsWith(\"${local.objects}/backups/\")"
  }
}

# Listing is checked on the bucket, so it is allowed for prefixes under backups/.
resource "google_storage_bucket_iam_member" "runtime_reads_backups" {
  bucket = google_storage_bucket.tempo.name
  role   = "roles/storage.objectViewer"
  member = local.runtime

  condition {
    title      = "backups-only"
    expression = "resource.name.startsWith(\"${local.objects}/backups/\") || (resource.type == \"storage.googleapis.com/Bucket\" && api.getAttribute(\"storage.googleapis.com/objectListPrefix\", \"\").startsWith(\"backups/\"))"
  }
}

# WAL-G uploads each file as temporary "<name>_chunks/..." objects, composes them, then deletes them.
resource "google_storage_bucket_iam_member" "runtime_cleans_upload_chunks" {
  bucket = google_storage_bucket.tempo.name
  role   = "roles/storage.objectUser"
  member = local.runtime

  condition {
    title      = "walg-upload-chunks-only"
    expression = "resource.name.startsWith(\"${local.objects}/backups/\") && resource.name.extract(\"_chunks/{chunk}\") != \"\""
  }
}

resource "google_storage_bucket_iam_member" "runtime_owns_lease" {
  bucket = google_storage_bucket.tempo.name
  role   = "roles/storage.objectUser"
  member = local.runtime

  condition {
    title      = "lease-only"
    expression = "resource.name.startsWith(\"${local.objects}/lease/\")"
  }
}
