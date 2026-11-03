#!/usr/bin/env bash
# ElementsWar 服务器一键配置（Ubuntu 22.04 / Debian 12）
# 用法：sudo bash deploy/setup.sh
# 幂等：可以重复执行
set -e

DOMAIN="${DOMAIN:-}"          # 可选：bash setup.sh 时传 DOMAIN=game.example.com
APP_DIR="/opt/elementswar"
APP_USER="deploy"

echo "==> 1/8 系统更新与基础软件"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw fail2ban nginx unzip ca-certificates

echo "==> 2/8 时区"
timedatectl set-timezone Asia/Shanghai || true

echo "==> 3/8 swap（2G 内存机器建议有）"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  swap 已创建"
else
  echo "  swap 已存在，跳过"
fi

echo "==> 4/8 应用用户"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
  echo "  已创建用户 $APP_USER（请用 ssh-copy-id 给它配公钥）"
else
  echo "  用户 $APP_USER 已存在"
fi

echo "==> 5/8 Node 20 LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "  已安装 $(node -v)"
fi

echo "==> 6/8 防火墙"
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
systemctl enable --now fail2ban || true

echo "==> 7/8 目录与 systemd 服务"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cat > /etc/systemd/system/ew-server.service <<'UNIT'
[Unit]
Description=ElementsWar Game Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/elementswar
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

systemctl daemon-reload
systemctl enable ew-server

echo "==> 8/8 Nginx 反代"
cat > /etc/nginx/sites-available/elementswar <<NGINX
server {
    listen 80;
    server_name ${DOMAIN:-_};

    root ${APP_DIR};
    index index.html;

    location / { try_files \$uri \$uri/ /index.html; }

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

ln -sf /etc/nginx/sites-available/elementswar /etc/nginx/sites-enabled/elementswar
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo " 环境就绪。下一步："
echo ""
echo " 1) 把你的代码放到 $APP_DIR："
echo "      cd $APP_DIR && git clone <你的仓库> ."
echo "    （或在本机执行： scp -r ./* deploy@服务器IP:$APP_DIR/）"
echo ""
echo " 2) 启动游戏服务器："
echo "      sudo systemctl restart ew-server"
echo "      sudo systemctl status ew-server --no-pager"
echo "      journalctl -u ew-server -f"
echo ""
if [ -z "$DOMAIN" ]; then
  echo " 3) 配域名与 HTTPS（先解析 A 记录到本机）："
  echo "      sudo apt install -y certbot python3-certbot-nginx"
  echo "      sudo certbot --nginx -d 你的域名"
else
  echo " 3) 已设置域名 $DOMAIN，执行："
  echo "      sudo apt install -y certbot python3-certbot-nginx"
  echo "      sudo certbot --nginx -d $DOMAIN"
fi
echo ""
echo " 4) 打开 http://服务器IP 验证页面能开"
echo "=========================================="
