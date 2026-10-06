# infra/ — Google Cloud resources for Eidos Tempo (Terraform)

Project `eidos-15111991`, region `us-central1`. State lives in `gs://eidos-tempo/tfstate/` (the bucket is created by
hand first, then adopted by the `import` block in `main.tf`). Step-by-step context: `docs/deploy-guide.md`.

| File | What |
|---|---|
| `modules/base/` | Service accounts `tempo-runtime` and `tempo-scheduler`, bucket `eidos-tempo` (60-day soft delete, 180-day clean-up of `backups/`, per-folder IAM conditions), Artifact Registry `tempo` |
| `run.tf` | Cloud Run service `tempo`: web + backend + db containers, min 1 / max 1 instance, request-based billing |
| `scheduler.tf` | `tempo-nightly-backup`: base backup + `pg_dump` at 03:00 and 15:00 Montevideo |
| `monitoring.tf` | Email channel, uptime check, two alerts (site down, no backup in 23 h) |

Not managed here (needs more than Editor, or done by hand): project IAM, public access (`allUsers` invoker),
the `tempo.eidos.ai` domain mapping.

```bash
gcloud config configurations activate eidos-tempo
cp terraform.tfvars.example terraform.tfvars        # set alert_email and backup_prefix
terraform init
terraform plan -target=module.base                  # first time: before any image exists
terraform apply -target=module.base
../scripts/seed-bucket.sh smoke --admin you@eidos.ai
../scripts/cloudrun-deploy.sh                       # pushes images (and deploys once the service exists)
terraform plan && terraform apply
```

Image tags are ignored by Terraform; `scripts/cloudrun-deploy.sh` sets them. Changing `backup_prefix` and applying
restarts the service on that backup set; nothing is deleted.
