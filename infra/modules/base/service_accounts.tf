resource "google_service_account" "runtime" {
  account_id   = "tempo-runtime"
  display_name = "Eidos Tempo (Cloud Run service)"
}

resource "google_service_account" "scheduler" {
  account_id   = "tempo-scheduler"
  display_name = "Eidos Tempo (nightly backup caller)"
}
