---
name: deploy
description: Guide a production deploy of Eidos Tempo to Cloud Run. Use when the user wants to deploy, release, ship or roll back, or asks what version is running in production.
---

# Deploy Eidos Tempo to Cloud Run

Production is one Cloud Run service (`tempo`, project `eidos-15111991`, region `us-central1`) whose database is
rebuilt from the bucket on every start. Read "Deployment" in README.md and "Deployment facts" in CLAUDE.md if
anything below is unclear. Guide the user step by step: explain what each step does, ask before anything that
changes the cloud, and stop at the first problem.

## 1. Compare what runs with what is local

Run `scripts/deploy-status.sh` (read-only) and summarize it for the user:

- **Up to date**, or **nothing the service runs changed** (only docs or the extension): say no deploy is needed.
  For extension changes, offer `cd extension && npm run build` and remind them to reload it in `chrome://extensions`
  and tell the team.
- **Uncommitted changes**: the deploy script refuses to run. Ask whether to commit them or stash them.
- **HEAD is not origin/main**: ask whether to deploy this branch anyway (normally: merge to `main` and push first,
  so what runs in production is in the shared repo).
- **HEAD does not contain the running commit**, or **the running commit is not in this checkout**: stop. Someone
  deployed something this checkout doesn't have; fetch, find out who, and don't overwrite it.
- **New commits**: list them in plain words (what changes for the team), then continue.

If gcloud fails with an authentication error, ask the user to run `! gcloud auth login` and
`! gcloud auth application-default login`, then retry.

## 2. Check the changes before shipping

- **Migrations** (`backend/alembic/versions/` changed): read the new files. They must be additive (CLAUDE.md, "Data
  safety"): no dropped or renamed columns, no destructive data changes. If one isn't, stop and explain.
- **Infra** (`infra/*.tf` changed): run `terraform -chdir=infra plan` (read-only) and show what it would change.
  The deploy script only changes images; the user must run `terraform apply` themselves (it may delete or replace
  resources, so never apply without them reading the plan).
- Run the full checks from CLAUDE.md ("Before finishing any change") and report the result. Don't deploy on a
  failure.

## 3. Ask before deploying

Ask in one message (AskUserQuestion works well):

1. **Timing**: saves fail for about a minute while the new instance takes over (the app shows "not saved" and rolls
   back). Is the team told, or is it outside working hours?
2. **Confirm** the commit and the list of changes from step 1.

## 4. Deploy

The user runs it (Claude Code may block deploy commands, and the build takes a few minutes):

```
! scripts/cloudrun-deploy.sh
```

It builds three linux/amd64 images tagged with the commit, pushes them and creates a new revision. It ends with
`Deployed <commit>.`; if it fails, show the error and stop.

## 5. Verify

1. `scripts/deploy-status.sh` must now say **up to date**.
2. Logs of the new revision (replace the revision name):
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.revision_name="<revision>" AND (textPayload=~"lease acquired|database ready|Holding the database lease" OR severity>=ERROR)' --freshness 15m --limit 30 --format="value(timestamp.date('%H:%M:%S'),labels.container_name,textPayload)"
   ```
   Expect `lease acquired`, `database ready` and `Holding the database lease`, and no errors.
3. Health: `curl -s https://tempo-787081458205.us-central1.run.app/api/health` returns `{"status":"ok"}` (while
   the service isn't public, use the proxy: `gcloud run services proxy tempo --region us-central1 --port 8080`).
4. Ask the user to open the app and try what the deploy changed.

## If something is wrong

Offer a rollback and let the user choose:

- **Deploy the previous commit** (always safe; migrations are additive):
  `git checkout <previous commit> && scripts/cloudrun-deploy.sh`, then `git checkout -` to come back.
- **Faster**: `gcloud run services update-traffic tempo --region us-central1 --to-revisions <previous revision>=100`.
  Only for a revision on the same backup set (`deploy-status.sh` shows the current one; check the old revision's
  `TEMPO_BACKUP_PREFIX`), otherwise it also switches the data.

Never delete revisions, images, or anything in the bucket, and never change `backup_prefix` as part of a deploy.
