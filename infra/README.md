# infra/ — Google Cloud resources for Eidos Tempo (Terraform)

Project `eidos-15111991`, region `us-central1`. State lives in `gs://eidos-tempo/tfstate/` (the bucket is created by
hand first, then adopted by the `import` block in `main.tf`).

| File | What |
|---|---|
| `modules/base/` | Service accounts `tempo-runtime` and `tempo-scheduler`, bucket `eidos-tempo` (60-day soft delete, 180-day clean-up of `backups/`, per-folder IAM conditions), Artifact Registry `tempo` |
| `run.tf` | Cloud Run service `tempo`: web + backend + db containers, min 1 / max 1 instance, request-based billing |
| `scheduler.tf` | `tempo-nightly-backup`: base backup + `pg_dump` at 03:00 Montevideo |

Not managed here (needs more than Editor, or done by hand): project IAM, public access (`allUsers` invoker),
a custom domain (the service uses its `run.app` URL). No Cloud Monitoring alerts: uptime and backups are watched from outside.

Needs Terraform ≥ 1.9, Docker, the gcloud CLI and Editor on the project. Terraform and the scripts name the project
explicitly, so your default gcloud project doesn't matter.

```bash
gcloud auth login && gcloud auth application-default login     # Terraform and the scripts use these credentials
gcloud auth configure-docker us-central1-docker.pkg.dev         # lets Docker push images
cp terraform.tfvars.example terraform.tfvars        # set backup_prefix
terraform init
terraform plan -target=module.base                  # first time: before any image exists
terraform apply -target=module.base
../scripts/seed-bucket.sh smoke --admin you@eidos.ai
../scripts/cloudrun-deploy.sh                       # pushes images (and deploys once the service exists)
terraform plan && terraform apply
```

Image tags are ignored by Terraform; `scripts/cloudrun-deploy.sh` sets them. Changing `backup_prefix` and applying
restarts the service on that backup set; nothing is deleted.
