# 发布到 GitHub

## 一次性准备

1. **安装 Git for Windows**：https://git-scm.com/download/win
   一路默认下一步即可（会顺带装上 Git Credential Manager，登录用）
2. **注册 / 登录 GitHub**，右上角 `+` → **New repository**
   - Repository name：`elementswar`（随意）
   - **Public** 或 Private 都行
   - ⚠️ **不要**勾选 "Add a README file"、".gitignore"、"license"（仓库必须是空的）
3. 建好后复制页面上的仓库地址，形如
   `https://github.com/你的用户名/elementswar.git`

## 发布

双击项目里的 **`publish.bat`**，按提示：

1. 第一次会让你填名字和邮箱（写进提交记录，随便填）
2. 粘贴仓库地址
3. 弹出浏览器 → 登录 GitHub → 授权
4. 看到「发布成功」就好了

以后每次改完代码，再双击一次 `publish.bat`，地址会记住，一路回车即可。

## 手动命令（不想用脚本时）

```bash
cd G:\ElementsWar
git init
git branch -M main
git add -A
git commit -m "ElementsWar v0.13.0"
git remote add origin https://github.com/你的用户名/elementswar.git
git push -u origin main
```

## 已经处理好的事

| 项 | 状态 |
|---|---|
| `dsh_ew.pem`（SSH 私钥） | 已写进 `.gitignore`，**不会被提交** |
| 服务器 IP | 已从 README 里移除 |
| 服务器密码 | 从未写入任何文件（已全仓库扫描确认） |
| `idea.txt`（你的私人草稿） | 已忽略 |
| LICENSE | MIT |
| 临时文件 / 编辑器配置 | 已忽略 |

## 仓库里会有什么

```
index.html          游戏入口
editor.html         地图编辑器
js/core.js          游戏核心逻辑（无 DOM 依赖，Node 可跑）
js/main.js          渲染 / 输入 / 界面
js/net.js           联机层（当前关闭）
js/settings.js      设置持久化
js/sfx.js           程序化音效
js/build.js         构建开关（NET_ENABLED）
server/             联机服务端（零依赖 WebSocket）
deploy/             部署脚本与 nginx 配置
tools/              测试与开发工具
design/             设计文档与脚本
shots/              截图
docs                README / CHANGELOG / SPEC / DEPLOY / MULTIPLAYER
```

## 常见问题

**推送被拒绝 `rejected (fetch first)`**
新建仓库时勾选了 README。执行：

```bash
git pull --rebase origin main
git push -u origin main
```

**弹不出登录窗口**
命令行里执行 `git credential-manager configure`，或改用 Personal Access Token 作为密码。

**想换成 SSH 方式**
```bash
git remote set-url origin git@github.com:你的用户名/elementswar.git
```
（需要先把公钥加到 GitHub → Settings → SSH and GPG keys）
