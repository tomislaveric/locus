#!/usr/bin/env bash

set -euo pipefail

echo "========================================"
echo " Staza Server Bootstrap"
echo "========================================"

if [ "${EUID}" -eq 0 ]; then
  echo "Please run this script as a normal sudo-capable user, not as root."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required."
  exit 1
fi

echo
echo "[1/8] Updating system packages..."
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y

echo
echo "[2/8] Installing base dependencies..."
sudo apt install -y \
  ca-certificates \
  curl \
  gnupg \
  ufw \
  git \
  rsync

echo
echo "[3/8] Removing potentially conflicting Docker packages..."
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
  sudo apt remove -y "$pkg" >/dev/null 2>&1 || true
done

echo
echo "[4/8] Configuring official Docker repository..."
sudo install -m 0755 -d /etc/apt/keyrings

sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

echo
echo "[5/8] Installing Docker Engine + Compose..."
sudo apt update

sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker

echo
echo "[6/8] Adding current user to docker group..."
sudo usermod -aG docker "$USER"

echo
echo "[7/8] Configuring UFW..."
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

sudo ufw --force enable

echo
echo "[8/8] Creating Staza directories..."

sudo mkdir -p /opt/staza
sudo mkdir -p /opt/staza/backups
sudo mkdir -p /opt/staza/data

sudo chown -R "$USER":"$USER" /opt/staza

echo
echo "========================================"
echo " Installation checks"
echo "========================================"

sudo docker --version
sudo docker compose version
sudo systemctl --no-pager --full status docker | head -n 10

echo
echo "UFW status:"
sudo ufw status verbose

echo
echo "========================================"
echo " Bootstrap completed"
echo "========================================"

echo
echo "IMPORTANT:"
echo "Log out and log back in before using Docker without sudo."
echo
echo "Then test with:"
echo
echo "  docker run --rm hello-world"
echo "  docker compose version"
echo
echo "Staza base directory:"
echo
echo "  /opt/staza"
echo
echo "Recommended next steps:"
echo
echo "  1. Configure DNS for play.staza.world"
echo "  2. Add docker-compose.yml"
echo "  3. Add PostgreSQL"
echo "  4. Add reverse proxy (e.g. Caddy)"
echo "  5. Add PostgreSQL backups"
echo
echo "A reboot is recommended if the system installed kernel/security updates."
