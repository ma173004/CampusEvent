# 06 · GitHub 实战教程（拿这个项目练手）

> 目标：从「完全没用过 GitHub」到「能独立完成 建仓库 → 提交 → 分支 → Pull Request → Pages 部署 → 协作」。
> 你已经装好 Git（v2.56.0）和 Node（v24.20.0），本机项目已经 `git init` 并完成第一次提交，分支名 `main`。
> 下面的命令都在 **PowerShell** 里执行，工作目录：`C:\Users\ma173\Desktop\ictsba\CampusEventSystem`

---

## 0. 先搞懂 5 个概念（很重要，不然命令记不住）

| 概念 | 一句话解释 | 类比 |
|---|---|---|
| **Repository（仓库）** | 一个项目文件夹 + 它的全部历史记录 | 一个带时间机器的文件夹 |
| **Commit（提交）** | 一次「存档」，记录改了什么、谁改的、为什么改 | 游戏存档 / Word 的版本快照 |
| **Branch（分支）** | 从某个提交分叉出来的平行开发线 | 平行宇宙，改坏了不影响 main |
| **Remote（远程）** | 托管在 GitHub 上的那份仓库 | 云端备份 + 团队共享 |
| **Pull Request（PR）** | 「请把我这条分支的改动合并进 main」的申请，可代码审查 | 交作业给组员审批 |

工作流本质只有 3 步循环：**改文件 → commit 存档 → push 上传**。

---

## 1. 配置身份（只需一次）

```powershell
git config --global user.name  "你的名字"
git config --global user.email "你的GitHub邮箱@example.com"
git config --global init.defaultBranch main
git config --global core.autocrlf true   # Windows 换行符自动转换，避免 CRLF 警告
git config --list                          # 检查
```

> 本机仓库已用 `git config user.name "ma173"` 设过局部身份，`--global` 是给以后所有仓库用的。建议改成你 GitHub 的真实用户名和邮箱。

## 2. 创建 GitHub 仓库并推送

1. 登录 <https://github.com> → 右上角 `+` → **New repository**。
2. 填：
   - Repository name：`CampusEventSystem`
   - 可见性：`Private`（作业建议私有；想用 Pages 公开演示就选 Public）
   - **不要**勾 Add README / .gitignore / license（本地已有，勾了会冲突）
3. 点 Create，复制页面上的 HTTPS 地址，例如 `https://github.com/你的用户名/CampusEventSystem.git`。
4. 本机执行：

```powershell
cd C:\Users\ma173\Desktop\ictsba\CampusEventSystem
git remote add origin https://github.com/你的用户名/CampusEventSystem.git
git remote -v                     # 确认 origin 指向正确
git push -u origin main           # 第一次推，-u 记住上游分支，以后直接 git push
```

推送时会弹窗要求登录：**GitHub 已不支持账号密码**，要用 **Personal Access Token (PAT)**：

- GitHub → 右上头像 → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)
- 勾选 `repo`（+ 如果要用 Actions/Pages，勾 `workflow`）
- 复制生成的 `ghp_xxx`（只显示一次，存好）
- 弹窗里用户名填 GitHub 用户名，密码粘贴 **token**

> 之后 Windows 会把它存进「凭据管理器」，不用每次输入。想改用 SSH？见第 10 节。

---

## 3. 日常三步循环（用得最多）

```powershell
git status                 # 看哪些文件改了（红=未暂存，绿=已暂存）
git diff                   # 看具体改了什么
git add .                  # 把改动放入暂存区（. 是全部；也可 git add 具体文件）
git commit -m "feat: 完成活动列表筛选与搜索"
git push                   # 上传到 GitHub
```

**Commit message 规范**（老师/组员一眼看懂，面试也看）：

| 前缀 | 用途 | 例 |
|---|---|---|
| `feat:` | 新功能 | `feat: 新增候补自动递补` |
| `fix:` | 修 bug | `fix: 修复截止时间判断时区错误` |
| `docs:` | 文档 | `docs: 补充 GAS 部署步骤` |
| `style:` | 格式/样式（不改逻辑） | `style: 统一活动卡片圆角` |
| `refactor:` | 重构 | `refactor: 抽出公共日期格式化函数` |
| `chore:` | 杂项/配置 | `chore: 初始化项目骨架` |

```powershell
git log --oneline --graph --all    # 图形化看历史
git show <commit哈希前7位>          # 看某次提交改了什么
```

---

## 4. 分支实战：为新功能开分支

**规则：`main` 永远保持能跑；新功能都在分支上做，做完再合并。**

```powershell
git switch -c feature/email-reminder     # 新建并切换分支（老命令：git checkout -b）
# ...改代码、测试...
git add .
git commit -m "feat: 每日邮件提醒"
git push -u origin feature/email-reminder
```

然后打开 GitHub 仓库页面 → 会看到黄色提示条 **Compare & pull request** → 点它：

1. 标题写 `feat: 每日邮件提醒`
2. 描述里写：做了什么 / 怎么测试 / 截图
3. 右侧可指定 Reviewer（组员）
4. 点 **Create pull request** → 审查通过后 **Merge pull request** → **Delete branch**

回到本机同步：

```powershell
git switch main
git pull                          # 拉取合并后的 main
git branch -d feature/email-reminder   # 删本地分支
git push origin --delete feature/email-reminder  # 删远程分支（GitHub 页面删过就跳过）
```

> 直接改 main 也不是不行（个人项目常见），但**作业/团队一定要用 PR**，这是老师看协作能力的地方。

## 5. 撤销与后悔药

```powershell
git restore 文件名              # 丢弃某个文件的未暂存修改（危险，不可恢复）
git restore --staged 文件名     # 把文件移出暂存区（保留修改）
git reset --soft HEAD~1        # 撤销上一次 commit，改动留在工作区
git reset --hard HEAD~1        # 连改动一起撤销（危险！）
git revert <commit>            # 生成一个「反向提交」来抵消某次提交（已推送时用这个，安全）
git stash                      # 临时收起当前修改（切分支救急）
git stash pop                  # 恢复
```

## 6. `.gitignore` 是什么

告诉 Git **哪些文件不要提交**。本项目已配好：忽略 `node_modules/`、`.env`、`*.log`、`*.xlsx`、编辑器配置等。
原则：**代码和文档提交；密钥、密码、依赖包、生成物不提交**。
（本项目 GAS 的试算表 ID 属于半敏感信息，建议正式项目改从「脚本属性」读取，而不是硬编码。）

## 7. GitHub 上各个功能怎么用（本项目直接练）

| 功能 | 位置 | 本项目怎么用 |
|---|---|---|
| **Issues** | 仓库 → Issues → New issue | 把「候补递补偶发失败」「移动端日历溢出」记成 issue，修完在 commit 里写 `fix: ... (#3)` 自动关联 |
| **Projects** | 仓库 → Projects | 建看板：Todo / Doing / Done，把 issue 拖进去当进度表（作业加分项） |
| **Actions** | 仓库 → Actions | 本项目已带 `.github/workflows/deploy-pages.yml`，push 后自动部署到 Pages |
| **Pages** | Settings → Pages | 在线演示网站（第 9 节） |
| **Releases** | 仓库 → Releases | 交作业时打 `v1.0` 标签，附 zip，老师直接下载 |
| **Wiki** | 仓库 → Wiki | 写详细使用手册（可选） |
| **Insights** | 仓库 → Insights | 看提交频率、贡献者，答辩时可展示开发过程 |
| **Fork** | 别人仓库右上角 | 复制别人项目到自己账号下改（不污染原仓库） |
| **Star / Watch** | 仓库右上角 | 收藏 / 订阅通知 |

## 8. 打标签与发布（交作业用）

```powershell
git tag -a v1.0 -m "SBA 交付版本：完整功能"
git push origin v1.0
```

GitHub → Releases → Draft a new release → 选 `v1.0` → 自动生成源码 zip → Publish。

## 9. 用 GitHub Pages 免费部署这个网站

**前置条件**：仓库必须是 **Public**（免费账号 Pages 只支持公开仓库）。

1. 确认 GAS 后端已部署，并把 `GAS_API` 填进 `1-frontend/assets/js/api.js`（否则线上页面连不上后端）。
2. 推送代码（本仓库已包含工作流 `.github/workflows/deploy-pages.yml`）：

```powershell
git add .
git commit -m "feat: 完整校园活动管理系统"
git push
```

3. 仓库 → **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**。
4. 等 1~2 分钟，Actions 页面变绿后，访问：
   `https://你的用户名.github.io/CampusEventSystem/login.html`
5. 首页地址是 `https://你的用户名.github.io/CampusEventSystem/`，若 404 就手动加 `/login.html`。

> 之后每次 `git push` 到 main，Actions 会自动重新部署，不用再做任何操作。
> 注意：Pages 是 HTTPS，GAS 的 `/exec` 也是 HTTPS，可以正常跨域请求；如果浏览器控制台报 CORS，检查 GAS 部署权限是否为「任何人」。

## 10. 可选：改用 SSH 免密推送

```powershell
ssh-keygen -t ed25519 -C "你的邮箱"     # 一路回车（可设 passphrase）
# 公钥在 C:\Users\ma173\.ssh\id_ed25519.pub，复制全部内容
# GitHub → Settings → SSH and GPG keys → New SSH key → 粘贴
ssh -T git@github.com                    # 看到 "Hi 用户名!" 即成功
git remote set-url origin git@github.com:你的用户名/CampusEventSystem.git
```

## 11. 常见报错急救

| 报错 | 原因 | 解决 |
|---|---|---|
| `rejected ... fetch first` | 远程有你本地没有的提交 | `git pull --rebase` 后再 `git push` |
| `fatal: remote origin already exists` | 已配过 origin | `git remote set-url origin 新地址` |
| `Authentication failed` | 用了账号密码 | 改用 PAT 或 SSH |
| `LF will be replaced by CRLF` | Windows 换行符警告 | 只是警告；设 `core.autocrlf true` 消除 |
| `fatal: not a git repository` | 不在仓库目录 | `cd` 到 `CampusEventSystem` |
| 推送超 100MB 文件 | GitHub 单文件限制 | 删除大文件并加入 `.gitignore`；已提交的用 `git filter-repo` 清理 |
| Pages 404 | 选的源/路径不对 | Settings→Pages 检查 Actions 部署是否成功；入口要 `/login.html` |

---

## 12. 本项目的推荐命令序列（照抄即可）

```powershell
cd C:\Users\ma173\Desktop\ictsba\CampusEventSystem

# 看看现在状态
git status

# 第一次推送到你新建的仓库（先建好空仓库，拿到地址）
git remote add origin https://github.com/你的用户名/CampusEventSystem.git
git push -u origin main

# 之后每次改完
git add .
git commit -m "feat: 补充 xxx 功能"
git push

# 练分支 + PR（拿一个小改动练手，比如改 README 里的错字）
git switch -c docs/fix-typo
# 改文件...
git add .
git commit -m "docs: 修正 README 错别字"
git push -u origin docs/fix-typo
# 去 GitHub 点 Compare & pull request → Create → Merge
git switch main
git pull
```

> 记住一句话：**commit 是存档，push 是上传，PR 是请人审查后合并。** 其它功能都是这三件事的变体。
