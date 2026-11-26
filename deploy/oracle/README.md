# Deploying TechnoVerse on Oracle Cloud Always Free

Status: written 2026-11-27, **not yet run on a real Oracle VM**. The scripts are plain bash and config; expect to fix one or two small things on the first run.

## What you get
One Arm VM (Always Free: 2 OCPU, 12 GB since June 2026, 10 TB/month egress) running:
- the game server (`node server.js`, port 3000, systemd service `technoverse`, restarts on crash)
- Caddy in front (automatic HTTPS, WebSocket passes through)
- coturn (voice relay), wired into the game through the `TURN_*` variables that `server.js` already reads

## Steps
1. **Create the VM** in the Oracle console: Compute, Instances, image Ubuntu 24.04, shape VM.Standard.A1.Flex with 2 OCPU / 12 GB, public IPv4, add your SSH key. Your home region (India) cannot be changed later, so pick the closest one at sign-up. Arm capacity is sometimes "out of capacity": retry later, or use the x86 `VM.Standard.E2.1.Micro` (1 GB, enough for a test, not for 100+ players).
2. **Domain:** add an A record (for example `play.yourdomain.com`) pointing at the VM's public IP. Caddy needs it to get a certificate.
3. **Open the ports in Oracle's own firewall** (separate from the VM's): VCN, Security Lists, the default list, add ingress rules from 0.0.0.0/0: TCP 80, TCP 443, UDP 443, TCP+UDP 3478, TCP 5349, UDP 49152-65535. (`setup.sh` opens the VM's iptables side.)
4. **Run setup on the VM:** `ssh ubuntu@<ip>`, `git clone <repo> /tmp/tv && cd /tmp/tv/deploy/oracle`, then
   `sudo DOMAIN=play.yourdomain.com REPO_URL=<repo url> bash setup.sh`
   (the repo must be readable by the VM: public, or use a deploy key / token in the URL.)
5. **Check:** `curl -I https://play.yourdomain.com/`, open it in a browser, and test voice between two networks (phone on mobile data and a laptop on wifi: that is the case TURN exists for).
6. **Update later:** `sudo bash /opt/technoverse/deploy/oracle/update.sh`.

## Things that can bite
- **Idle reclamation:** Oracle may reclaim an Always Free instance whose CPU, network and (on Arm) memory use stay under 20% for 7 days. A quiet game server is exactly that. The reliable fix is to upgrade the account to **Pay As You Go**: nothing is charged while you stay inside the Always Free limits, and the reclamation rule no longer applies. Do not rely on a keep-busy script.
- **The `models/` folder is about 118 MB** and avatars are 6 MB each. The server gzips only text; `.glb` files are cached by the browser for a week after the first visit. First-load size is the next thing to work on (tree already cut from 8.9 to 2.6 MB).
- **Spend alert:** set a budget alert at 1 dollar in Billing so a mistake (for example a paid shape) is visible.
- **TURN password** lives in `/etc/technoverse-turn-pass` (root only) and in the service file. Rotate by deleting that file and re-running `setup.sh`.
- The server's `MAX_PLAYERS` is 200; one 2-OCPU Arm core pair handles the 10 snapshots/s fan-out for that, but measure before promising it.
