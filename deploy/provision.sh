#!/usr/bin/env bash
# ElementsWar 服务器环境部署（在已能 sudo 的普通用户下执行）
# 用法： bash deploy/provision.sh
# 幂等，可重复执行
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/elementswar}"
RUN_USER="${RUN_USER:-$(id -un)}"
DOMAIN="${DOMAIN:-_}"

echo "==> 目标目录 $APP_DIR  运行用户 $RUN_USER  域名 $DOMAIN"

echo "==> [1/7] apt 更新"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates ufw fail2ban nginx

echo "==> [2/7] swap 2G"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "    swap 已启用"
else
  echo "    swap 已存在"
fi

echo "==> [3/7] Node 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
echo "    $(node -v)"

echo "==> [4/7] 防火墙"
sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow 22/tcp >/dev/null 2>&1 || true
sudo ufw allow 80/tcp >/dev/null 2>&1 || true
sudo ufw allow 443/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null
sudo systemctl enable --now fail2ban >/dev/null 2>&1 || true
echo "    ufw: $(sudo ufw status | head -1)"

echo "==> [5/7] 目录权限"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"

echo "==> [6/7] systemd 服务"
sudo tee /etc/systemd/system/ew-server.service >/dev/null <<UNIT
[Unit]
Description=ElementsWar Game Server
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=UV_THREADPOOL_SIZE=2
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable ew-server >/dev/null 2>&1 || true
sudo systemctl restart ew-server
sleep 1
echo "    服务状态: $(systemctl is-active ew-server)"

echo "==> [7/7] Nginx 反代"
sudo tee /etc/nginx/sites-available/elementswar >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name $DOMAIN;

    root $APP_DIR;
    index index.html;

    location / { try_files \$uri \$uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/elementswar /etc/nginx/sites-enabled/elementswar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx >/dev/null 2>&1 || true
echo "    nginx: $(systemctl is-active nginx)"

echo ""
echo "==> 本机自检"
curl -s -o /dev/null -w "  GET /       -> %{http_code}\n" http://127.0.0.1/
curl -s -o /dev/null -w "  GET /js/core.js -> %{http_code}\n" http://127.0.0.1/js/core.js
echo ""
echo "完成。公网访问 http://<服务器IP>/"
