# infra/ — Google Cloud resources for Eidos Tempo (Terraform)

Project `eidos-15111991`, region `us-central1`. State lives in `gs://eidos-tempo/tfstate/` (the bucket is created by
hand first, then adopted by the `import` block in `main.tf`).

| File | What |
|---|---|
| `modules/base/` | Service accounts `tempo-runtime` and `tempo-scheduler`, bucket `eidos-tempo` (60-day soft delete, 180-day clean-up of `backups/`, per-folder IAM conditions), Artifact Registry `tempo` |
| `run.tf` | Cloud Run service `tempo`: web + backend + db containers, min 1 / max 1 instance, request-based billing |
| `scheduler.tf` | `tempo-nightly-backup`: base backup + `pg_dump` at 03:00 Montevideo |

Public access is `invoker_iam_disabled = true` in `run.tf` (Cloud Run skips its own sign-in check; the app still
requires a login). Changing that setting needs `run.services.setIamPolicy`, which Editor doesn't have: a project
Owner turns it on once (step 7); after that, Editor applies leave it as is.

Not managed here (done by hand): project IAM and a custom domain (the service uses its `run.app` URL).
No Cloud Monitoring alerts: uptime and backups are watched from outside.

## What you need

Terraform ≥ 1.9, Docker (with `buildx`), the gcloud CLI and Editor on the project. Terraform and the scripts name
the project explicitly, so your default gcloud project doesn't matter.

```bash
gcloud auth login && gcloud auth application-default login     # Terraform and the scripts use these credentials
gcloud auth configure-docker us-central1-docker.pkg.dev         # lets Docker push images
```

## First-time setup (a new project)

Skip the steps already done: in `eidos-15111991` everything below exists.

1. Turn on the APIs (Editor):
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com \
     iam.googleapis.com iamcredentials.googleapis.com storage.googleapis.com cloudresourcemanager.googleapis.com \
     --project eidos-15111991
   ```
2. Create the bucket (it holds Terraform's state, so it must exist before `terraform init`):
   ```bash
   gcloud storage buckets create gs://eidos-tempo --project eidos-15111991 --location us-central1 \
     --default-storage-class STANDARD --uniform-bucket-level-access --public-access-prevention --soft-delete-duration 60d
   ```
3. Base resources (free), from `infra/`:
   ```bash
   cp terraform.tfvars.example terraform.tfvars        # backup_prefix = the set created in step 4
   terraform init
   terraform plan -target=module.base && terraform apply -target=module.base
   ```
4. A first backup set: the service refuses to start without one. Asks for your name and a password:
   ```bash
   ../scripts/seed-bucket.sh <prefix> --admin you@eidos.ai            # empty; add --toggl to import Toggl
   ```
   Use the same `<prefix>` as `backup_prefix` in `terraform.tfvars`.
5. Images, then the service and the nightly job (from here about 0.45 USD/day):
   ```bash
   ../scripts/cloudrun-deploy.sh                       # first time it only pushes; the service doesn't exist yet
   terraform plan && terraform apply
   ```
   Creating the service sets public access, which needs an Owner (step 7). An Editor sets
   `invoker_iam_disabled = false` in `run.tf` for this first apply, puts it back afterwards, and leaves step 7 to an
   Owner.
6. Check it (the service is private until step 7):
   ```bash
   terraform output service_url
   gcloud run services proxy tempo --region us-central1 --port 8080   # then open http://localhost:8080 and log in
   ```
7. **A project Owner** makes it public (the setting in `run.tf`, which Editor can't change):
   ```bash
   gcloud run services update tempo --region us-central1 --project eidos-15111991 --no-invoker-iam-check
   ```
   Public access is also what lets the nightly job call `/api/internal/backup` (the backend checks the job's
   Google token itself). Check it once: `gcloud scheduler jobs run tempo-nightly-backup --location us-central1`,
   then a new file appears in `gs://eidos-tempo/backups/<prefix>/dumps/`. On a brand-new project, an Owner can
   instead run step 5's `terraform apply`, which then creates the service public directly.

## Later changes

Image tags are ignored by Terraform; `scripts/cloudrun-deploy.sh` sets them (see the main README, "Deploying a new
version"). Changing `backup_prefix` and applying restarts the service on that backup set; nothing is deleted and the
previous set stays as it was. `terraform.tfvars` is not committed.
