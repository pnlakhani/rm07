variable "aws_region" {
  description = "AWS region. Locked to Mumbai for data residency (ap-south-1)."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = var.aws_region == "ap-south-1"
    error_message = "RM07 P1 infrastructure is locked to ap-south-1 (Mumbai) for data residency."
  }
}

variable "md_eip_name" {
  description = "Name tag for the static Elastic IP registered with brokers (NSE Feb-2025 circular)."
  type        = string
  default     = "eipalloc-rm07-md-prod"
}
