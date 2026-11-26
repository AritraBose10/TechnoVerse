#!/usr/bin/env bash
# One-shot setup of TechnoVerse on a fresh Oracle Cloud Always Free VM (Ubuntu 22.04/24.04, Arm or x86).
#   sudo DOMAIN=play.example.com REPO_URL=https://github.com/AritraBose10/TechnoVerse.git bash setup.sh
# Re-running is safe: it only fills in what is missing. NOT tested on a real Oracle VM yet: read README.md first.
set -euo pipefail
: "${DOMAIN:?set DOMAIN to the (sub)domain pointing at this VM, e.g. play.example.com}"
: "${REPO_URL:?set REPO_URL to the git repo to deploy}"
APP_USER=technoverse
APP_DIR=/opt/technoverse
TURN_USER=tv
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"

echo "== packages"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https coturn
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "== app"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
[ -d "$APP_DIR/.git" ] || git clone --depth 1 "$REPO_URL" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm ci --omit=dev"

echo "== TURN (voice relay)"
PUBLIC_IP="$(curl -fsS https://api.ipify.org)"
PRIVATE_IP="$(hostname -I | awk '{print $1}')"
TURN_PASS_FILE=/etc/technoverse-turn-pass
[ -s "$TURN_PASS_FILE" ] || { head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$TURN_PASS_FILE"; chmod 600 "$TURN_PASS_FILE"; }
TURN_PASS="$(cat "$TURN_PASS_FILE")"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PUBLIC_IP__/$PUBLIC_IP/g" -e "s/__PRIVATE_IP__/$PRIVATE_IP/g" \
    -e "s/__TURN_USER__/$TURN_USER/g" -e "s/__TURN_PASS__/$TURN_PASS/g" "$here/turnserver.conf.template" > /etc/turnserver.conf
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn

echo "== game service"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__TURN_USER__/$TURN_USER/g" -e "s/__TURN_PASS__/$TURN_PASS/g" "$here/technoverse.service.template" > /etc/systemd/system/technoverse.service
sed -e "s/__DOMAIN__/$DOMAIN/g" "$here/Caddyfile.template" > /etc/caddy/Caddyfile

echo "== firewall (Ubuntu images on Oracle ship iptables rules that block everything but ssh)"
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443" "-p udp --dport 3478" "-p tcp --dport 3478" "-p tcp --dport 5349" "-p udp --dport 49152:65535"; do
  iptables -C INPUT $rule -j ACCEPT 2>/dev/null || iptables -I INPUT 6 $rule -j ACCEPT
done
command -v netfilter-persistent >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
netfilter-persistent save

systemctl daemon-reload
systemctl enable --now technoverse coturn caddy
systemctl restart technoverse coturn caddy
echo
echo "Done. Still to do by hand (README.md, step 3): open the same ports in the Oracle VCN security list, and point DNS for $DOMAIN at $PUBLIC_IP."
echo "Check: curl -I https://$DOMAIN/   and   systemctl status technoverse"
