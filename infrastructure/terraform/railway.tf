# Railway infrastructure via Terraform
# Provider: https://registry.terraform.io/providers/terraform-community-providers/railway
# Note: Railway Terraform provider is community-maintained; verify before applying.

terraform {
  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.3"
    }
  }
}

provider "railway" {
  token = var.railway_token
}

variable "railway_token" {
  description = "Railway API token"
  sensitive   = true
}

variable "supabase_url"         { sensitive = true }
variable "supabase_key"         { sensitive = true }
variable "supabase_jwt_secret"  { sensitive = true }
variable "anthropic_api_key"    { sensitive = true }
variable "stripe_secret_key"    { sensitive = true }
variable "stripe_webhook_secret" { sensitive = true }
variable "fernet_key"           { sensitive = true }
variable "polygon_api_key"      { sensitive = true }
variable "finnhub_api_key"      { sensitive = true }

resource "railway_project" "neufin" {
  name = "neufin101"
}

resource "railway_service" "backend_production" {
  project_id = railway_project.neufin.id
  name       = "neufin101-production"

  source = {
    repo   = "varunsrivastava/neufinapk1"
    branch = "main"
  }
}

resource "railway_variable" "backend_prod_vars" {
  for_each = {
    SUPABASE_URL          = var.supabase_url
    SUPABASE_KEY          = var.supabase_key
    SUPABASE_JWT_SECRET   = var.supabase_jwt_secret
    ANTHROPIC_API_KEY     = var.anthropic_api_key
    STRIPE_SECRET_KEY     = var.stripe_secret_key
    STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    FERNET_KEY            = var.fernet_key
    POLYGON_API_KEY       = var.polygon_api_key
    FINNHUB_API_KEY       = var.finnhub_api_key
    APP_BASE_URL          = "https://neufin101-production.up.railway.app"
  }

  project_id  = railway_project.neufin.id
  service_id  = railway_service.backend_production.id
  name        = each.key
  value       = each.value
}

resource "railway_service" "backend_staging" {
  project_id = railway_project.neufin.id
  name       = "neufin101-staging"

  source = {
    repo   = "varunsrivastava/neufinapk1"
    branch = "main"
  }
}

output "backend_production_url" {
  value = "https://neufin101-production.up.railway.app"
}

output "backend_staging_url" {
  value = "https://neufin101-staging.up.railway.app"
}
