# ElementsWar 服务器配置指南（腾讯云轻量应用服务器）

## 一、先做三个选择

### 1. 操作系统：选 Ubuntu 22.04 LTS

你现在选的是 **OpenCloudOS 9**（腾讯自研，RHEL 9 系，用 `dnf`）。

| 选项 | 建议 | 理由 |
|---|---|---|
| **Ubuntu 22.04 LTS** | ✅ **推荐** | 教程最多、`apt` 生态、Node/certbot/nginx 全是现成命令 |
| Debian 12 | ✅ 也很好 | 更轻、更稳，命令和 Ubuntu 基本一致 |
| OpenCloudOS 9 | ⚠️ 能用 | RHEL 系，`dnf` 代替 `apt`，遇到问题网上资料少一半 |
| CentOS 7/8 | ❌ 不要 | 已停止维护 |
| Windows Server | ❌ 不要 | 光系统就吃 1G+ 内存，还要付授权费 |

> 这个项目只需要跑一个 Node 进程 + Nginx，**Ubuntu 22.04 LTS 是最少踩坑的**。

### 2. 配置：2 核 2G 起步，够用

按前面的带宽估算：一局 10 人下行约 90 KB/s ≈ **0.72 Mbps**。

| 配置 | 能跑几局 | 适合 |
|---|---|---|
| 2核2G / 4Mbps | 约 4–5 局 | 自己测试、小范围内测 |
| **2核4G / 6Mbps** | 约 7–8 局 | ✅ 推荐起点 |
| 4核8G / 12Mbps | 20 局+ | 公开测试 |

流量包不用担心：一局一小时约 320 MB，1 TB/月能跑 3000 局·小时。
**瓶颈是"峰值带宽"，不是流量**。

### 3. 地域：决定了要不要备案

| 地域 | 域名 | 说明 |
|---|---|---|
| 中国大陆（北京/上海/广州） | **必须 ICP 备案** | 备案要 1–3 周，且需要域名+实名 |
| **香港 / 新加坡 / 东京** | 不需要 | ✅ 内测阶段推荐，延迟 30–60ms 可玩 |

**如果你还没有备案，直接选香港。** 没备案就用大陆机器 + 域名 → 80/443 会被拦，wss 直接连不上。

---

## 二、创建时怎么填

**登录凭证：**

- 现在选「自定义密码」没问题，但**创建完立刻换成 SSH 密钥**（见下面第 3 步）
- 密码要求：12 位以上，大小写+数字+符号。别用 `admin123` 这种——轻量的机器公网 IP 天天被扫

**其他的默认即可。**

---

## 三、创建后的配置（Ubuntu 22.04）

### 第 0 步：先配控制台防火墙

轻量服务器有**两层防火墙**，两层都要开：

1. 控制台 → 防火墙 → 添加规则：`22`(SSH)、`80`(HTTP)、`443`(HTTPS)
2. 系统内 `ufw`（下面第 4 步）

**只开这三个端口。** 数据库、Node 端口一律不对外。

### 第 1 步：登录并更新

```bash
ssh root@你的公网IP

apt update && apt upgrade -y
apt install -y curl git ufw fail2ban nginx unzip
timedatectl set-timezone Asia/Shanghai
```

### 第 2 步：加 2G swap（2G 内存的机器建议加）

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 第 3 步：建普通用户 + SSH 密钥（重要）

```bash
adduser deploy
usermod -aG sudo deploy

# 把本机的公钥拷进去（在你自己的电脑上执行）
ssh-copy-id deploy@你的公网IP
```

然后**关掉密码登录**：

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 第 4 步：防火墙 + 防爆破

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

systemctl enable --now fail2ban
```

### 第 5 步：装 Node 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v     # 应输出 v20.x
```

> 不要用 `apt install nodejs`（Ubuntu 自带的是 12/18 版本）。

### 第 6 步：放代码

```bash
sudo mkdir -p /opt/elementswar
sudo chown deploy:deploy /opt/elementswar
cd /opt/elementswar
git clone 你的仓库 .
# 或者本机 scp -r 上传
```

### 第 7 步：Node 服务常驻（systemd）

`/etc/systemd/system/ew-server.service`：

```ini
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
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ew-server
sudo systemctl status ew-server
journalctl -u ew-server -f      # 看日志
```

### 第 8 步：Nginx 反代 + wss

`/etc/nginx/sites-available/elementswar`：

```nginx
server {
    listen 80;
    server_name game.example.com;

    # 静态页面（index.html / js / editor.html）
    root /opt/elementswar/public;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/elementswar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**`proxy_read_timeout` 必须加大**（默认 60s）。WebSocket 空闲超过 60 秒会被 Nginx 掐断，
表现就是"玩家挂机一会就掉线"，这是最常见的坑。

### 第 9 步：HTTPS 证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.com
```

自动续期已经配好，验证一下：`sudo certbot renew --dry-run`。

> **域名解析**：先去域名商把 `A` 记录指到服务器 IP，等生效（几分钟）再跑 certbot。

### 第 10 步：验证

浏览器打开 `https://game.example.com`，能进游戏；
然后浏览器控制台执行：

```js
const ws = new WebSocket('wss://game.example.com/ws');
ws.onopen = () => console.log('wss ok');
ws.onerror = e => console.log('fail', e);
```

输出 `wss ok` 就通了。

---

## 四、性能与监控

```bash
# 内存 / CPU
htop

# 实时看服务日志
journalctl -u ew-server -f

# 看端口
ss -tlnp | grep 8080
```

在代码里记录**每 tick 耗时**和**快照字节数**，超过 30ms/tick 就说明该降频或分房间进程了。

```bash
# Node 端限制线程数（2 核）
Environment=UV_THREADPOOL_SIZE=2
```

---

## 五、常见坑清单

| 现象 | 原因 | 解决 |
|---|---|---|
| 域名打不开但 IP 能开 | 大陆机器没备案 | 换香港节点，或走备案 |
| wss 连不上、http 正常 | 混合内容 / 证书没生效 | 页面必须 https，证书 `certbot` 装好 |
| 挂机 60 秒掉线 | Nginx 默认 `proxy_read_timeout` 60s | 改成 3600s |
| 连不上但服务是 running | 控制台防火墙没放行 | 轻量控制台 + `ufw` 两层都要开 |
| 内存慢慢涨到爆 | 房间没销毁 / 事件监听没移除 | 对局结束后 `clearInterval` + `room.destroy()` |
| 输入延迟不稳定 | 服务器在境外 + 没用预测 | 先做 P2 的客户端预测 |

---

## 六、一句话总结

**选 Ubuntu 22.04 LTS、2核4G、香港节点**，然后照第三节走一遍。
真正需要记住的只有三条：

1. **wss 必须要域名 + 证书**，大陆机器要备案
2. **Nginx 的反代超时要改大**，否则挂机就掉线
3. **只开 22/80/443**，Node 的 8080 只监听 `127.0.0.1`
