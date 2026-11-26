#!/usr/bin/env bash
# Pull the latest game code and restart. Run on the VM:  sudo bash /opt/technoverse/deploy/oracle/update.sh
set -euo pipefail
cd /opt/technoverse
sudo -u technoverse git pull --ff-only
sudo -u technoverse npm ci --omit=dev
systemctl restart technoverse
systemctl is-active technoverse
