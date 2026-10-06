output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "scheduler_service_account" {
  value = google_service_account.scheduler.email
}
