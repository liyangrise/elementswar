@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==========================================
echo   ElementsWar 发布到 GitHub
echo ==========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [x] 没有找到 git
  echo.
  echo     请先安装 Git for Windows： https://git-scm.com/download/win
  echo     安装完关掉这个窗口，重新双击运行本脚本。
  echo.
  pause
  exit /b 1
)

echo [1/6] 检查 git 身份
for /f "delims=" %%i in ('git config user.name 2^>nul') do set GNAME=%%i
if "!GNAME!"=="" (
  set /p GNAME=     你的名字（会写进提交记录）:
  git config user.name "!GNAME!"
)
for /f "delims=" %%i in ('git config user.email 2^>nul') do set GMAIL=%%i
if "!GMAIL!"=="" (
  set /p GMAIL=     你的邮箱:
  git config user.email "!GMAIL!"
)
echo      !GNAME! ^<!GMAIL!^>

echo [2/6] 初始化仓库
if not exist .git (
  git init -q
  git branch -M main
  echo     已创建 .git
) else (
  echo     仓库已存在
)

echo [3/6] 安全检查：确认没有私钥被加入
git add -A
git ls-files | findstr /i /c:".pem" /c:"id_rsa" /c:".ppk" >nul
if not errorlevel 1 (
  echo.
  echo [x] 检测到私钥文件即将被提交，已中止
  git ls-files | findstr /i /c:".pem" /c:"id_rsa" /c:".ppk"
  echo     请把上面的文件移出目录，或加入 .gitignore
  pause
  exit /b 1
)
echo     安全 ✓

echo [4/6] 提交
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "ElementsWar v0.13.0 - 2D 俯视角元素射击"
  echo     已提交
) else (
  echo     没有改动，跳过
)

echo [5/6] 设置远程仓库
echo.
echo     先在 GitHub 网页上新建一个空仓库（不要勾选 README / .gitignore）
echo     然后把它给的地址粘到这里，例如：
echo     https://github.com/你的用户名/elementswar.git
echo.
set /p REPO=     仓库地址:
if "!REPO!"=="" (
  echo     未填写，退出
  pause
  exit /b 1
)
git remote remove origin >nul 2>nul
git remote add origin "!REPO!"

echo [6/6] 推送
echo.
echo     首次推送会弹出浏览器让你登录 GitHub，登录后自动完成。
echo.
git push -u origin main
if errorlevel 1 (
  echo.
  echo [x] 推送失败。常见原因：
  echo     1. 仓库里已经有文件（新建时勾了 README）→ 先执行 git pull --rebase origin main
  echo     2. 没登录 → 重新运行本脚本，在弹出的窗口里登录
  echo     3. 地址写错 → 检查有没有 .git 后缀
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   发布成功
echo ==========================================
echo   仓库地址：!REPO!
echo.
pause
