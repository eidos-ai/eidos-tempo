terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
  }

  backend "gcs" {
    bucket = "eidos-tempo"
    prefix = "tfstate"
  }
}

provider "google" {
  project        = var.project
  region         = var.region
  default_labels = local.labels
}

locals {
  labels   = { app = "eidos-tempo" }
  registry = "${var.region}-docker.pkg.dev/${var.project}/tempo"
}

module "base" {
  source  = "./modules/base"
  project = var.project
  region  = var.region
  bucket  = var.bucket
  labels  = local.labels
}

# The bucket was created by hand (Terraform keeps its state in it); this adopts it without recreating it.
import {
  to = module.base.google_storage_bucket.tempo
  id = var.bucket
}
