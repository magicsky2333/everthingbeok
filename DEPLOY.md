# 部署到 Vercel 完整指南

## 1. 注册 Turso（数据库）

1. 打开 https://turso.tech，用 GitHub 账号注册（免费）
2. 点击 **Create Database** → 选择离你最近的区域（如 `nrt` 东京）
3. 数据库创建后，点进去 → **Generate Token** → 复制 Token
4. 同时复制数据库的 **URL**（格式：`libsql://xxx.turso.io`）

> 免费额度：500MB 存储 + 每月 10亿次读取，个人站完全够用。

---

## 2. 注册 Cloudinary（图片存储）

1. 打开 https://cloudinary.com，注册免费账号
2. 登录后进入 **Dashboard**，页面顶部可以看到三个值：
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. 把这三个值记下来

> 免费额度：25GB 存储 + 25GB 每月流量，够用很久。

---

## 3. 部署到 Vercel

### 方式一：GitHub 自动部署（推荐）

1. 把代码推到 GitHub 仓库（如 `github.com/你的用户名/vantis`）
2. 打开 https://vercel.com，用 GitHub 登录
3. 点击 **Add New Project** → 选择你的仓库 → Import
4. 在 **Environment Variables** 里填入以下 6 个变量：

| 变量名 | 值 |
|--------|-----|
| `JWT_SECRET` | 随机字符串，如 `openssl rand -base64 32` 生成的 |
| `TURSO_DATABASE_URL` | Turso 给的 URL |
| `TURSO_AUTH_TOKEN` | Turso 给的 Token |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name |
| `CLOUDINARY_API_KEY` | Cloudinary API Key |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret |

5. 点击 **Deploy** → 等待约 1 分钟

### 方式二：Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

---

## 4. 绑定自定义域名

1. 在 Vercel 项目页面 → **Settings** → **Domains**
2. 输入你购买的域名 `everythingbeok.life` → Add
3. Vercel 会给你一条 CNAME 记录，去你的域名注册商（Namecheap / Cloudflare）DNS 设置里添加即可
4. SSL 证书 Vercel 自动签发，无需额外操作

---

## 5. 修改默认管理员密码

部署完成后，第一件事：

1. 打开你的网站 → 登录 → 管理员入口
2. 默认用户名 `admin`，默认密码 `admin`
3. **立即修改密码**（目前需要直接在 Turso 控制台执行 SQL，或你可以在 server.js 里加一个改密接口）

---

## 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量文件
cp .env.example .env
# 编辑 .env，本地开发时 TURSO_DATABASE_URL 可以不填，会自动使用本地 data.db

# 启动
npm run dev
```

访问 http://localhost:3000
