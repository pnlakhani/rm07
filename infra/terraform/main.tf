# Static Elastic IP for the market-data egress, registered with each broker per the
# NSE algorithmic-API operational circular (Feb 2025). Hard rule #10.
# This is the single most launch-critical infra resource (must exist before private beta
# places live orders). Associate it with the Fargate service's NAT/network interface in the
# market-data infra ticket.
resource "aws_eip" "md_egress" {
  domain = "vpc"

  tags = {
    Name    = var.md_eip_name
    Purpose = "broker-registered-static-egress-ip"
    Rule    = "NSE-algo-API-circular-2025-02"
  }
}

output "md_egress_public_ip" {
  description = "Static public IP to register in each broker partner portal."
  value       = aws_eip.md_egress.public_ip
}
