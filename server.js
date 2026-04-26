/* ============================================================
   yingyi.ma — server.js
   Express + Turso (libSQL) + Cloudinary + JWT auth
   Vercel-compatible (serverless)
   ============================================================ */

const express = require('express');
const { createClient } = require('@libsql/client');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vantis-blog-secret-key-change-in-production';

// ---- Cloudinary ----
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(buffer, folder = 'vantis') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

// ---- Middleware ----
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Multer (memory storage → Cloudinary) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只能上传图片文件'));
  }
});

// ---- Database (Turso / libSQL) ----
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:data.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ---- Init DB ----
async function initDB() {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'visitor',
        nickname TEXT NOT NULL,
        contact TEXT,
        avatar_url TEXT,
        bio TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'status',
        title TEXT DEFAULT '',
        body TEXT DEFAULT '',
        images TEXT DEFAULT '[]',
        author_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id)
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(post_id, user_id)
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`, args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT DEFAULT 'yingyi.ma',
        bio TEXT DEFAULT 'Developer & creator. See further, build cleaner.',
        avatar_url TEXT DEFAULT ''
      )`, args: []
    },
  ], 'write');

  // Seed admin
  const adminRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: ['admin'] });
  if (adminRes.rows.length === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    await db.execute({
      sql: 'INSERT INTO users (username, password, role, nickname) VALUES (?, ?, ?, ?)',
      args: ['admin', hash, 'admin', 'yingyi.ma']
    });
  }

  // Seed profile
  const profileRes = await db.execute({ sql: 'SELECT id FROM profile WHERE id = 1', args: [] });
  if (profileRes.rows.length === 0) {
    await db.execute({ sql: 'INSERT INTO profile (id) VALUES (1)', args: [] });
  }
}

// ---- Auth middleware ----
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    next();
  });
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

// ---- API: Auth ----

app.post('/api/auth/admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ? AND role = ?',
      args: [username, 'admin']
    });
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign({ id: Number(user.id), role: 'admin', nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: Number(user.id), role: 'admin', nickname: user.nickname } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/visitor', async (req, res) => {
  try {
    const { nickname, contact } = req.body;
    if (!nickname || !contact) return res.status(400).json({ error: '请填写昵称和联系方式' });

    const existing = await db.execute({
      sql: 'SELECT * FROM users WHERE contact = ? AND role = ?',
      args: [contact, 'visitor']
    });
    let user = existing.rows[0];

    if (!user) {
      const hash = bcrypt.hashSync(contact, 10);
      const ins = await db.execute({
        sql: 'INSERT INTO users (username, password, role, nickname, contact) VALUES (?, ?, ?, ?, ?)',
        args: [contact, hash, 'visitor', nickname, contact]
      });
      user = { id: ins.lastInsertRowid, role: 'visitor', nickname };
    } else {
      if (user.nickname !== nickname) {
        await db.execute({ sql: 'UPDATE users SET nickname = ? WHERE id = ?', args: [nickname, user.id] });
        user = { ...user, nickname };
      }
    }

    const token = jwt.sign({ id: Number(user.id), role: 'visitor', nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: Number(user.id), role: 'visitor', nickname: user.nickname } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- API: Profile ----

app.get('/api/profile', async (req, res) => {
  try {
    const result = await db.execute({ sql: 'SELECT * FROM profile WHERE id = 1', args: [] });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/profile', adminRequired, async (req, res) => {
  try {
    const { name, bio } = req.body;
    await db.execute({
      sql: 'UPDATE profile SET name = ?, bio = ? WHERE id = 1',
      args: [name || 'yingyi.ma', bio || '']
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/profile/avatar', adminRequired, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const url = await uploadToCloudinary(req.file.buffer, 'vantis/avatars');
    await db.execute({ sql: 'UPDATE profile SET avatar_url = ? WHERE id = 1', args: [url] });
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- API: Posts ----

app.get('/api/posts', optionalAuth, async (req, res) => {
  try {
    const { type } = req.query;
    let sql = `SELECT p.*, u.nickname as author_name FROM posts p JOIN users u ON p.author_id = u.id`;
    const args = [];
    if (type && type !== 'all') {
      sql += ' WHERE p.type = ?';
      args.push(type);
    }
    sql += ' ORDER BY p.created_at DESC';

    const postsRes = await db.execute({ sql, args });

    const result = await Promise.all(postsRes.rows.map(async (p) => {
      const likesRes = await db.execute({
        sql: 'SELECT l.*, u.nickname FROM likes l JOIN users u ON l.user_id = u.id WHERE l.post_id = ?',
        args: [p.id]
      });
      const commentsRes = await db.execute({
        sql: 'SELECT c.*, u.nickname FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC',
        args: [p.id]
      });
      return {
        ...p,
        id: Number(p.id),
        author_id: Number(p.author_id),
        images: JSON.parse(p.images || '[]'),
        likes: likesRes.rows.map(l => ({ ...l, id: Number(l.id), post_id: Number(l.post_id), user_id: Number(l.user_id) })),
        comments: commentsRes.rows.map(c => ({ ...c, id: Number(c.id), post_id: Number(c.post_id), user_id: Number(c.user_id) })),
      };
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts', adminRequired, async (req, res) => {
  try {
    const { type, title, body, images } = req.body;
    const result = await db.execute({
      sql: 'INSERT INTO posts (type, title, body, images, author_id) VALUES (?, ?, ?, ?, ?)',
      args: [type || 'status', title || '', body || '', JSON.stringify(images || []), req.user.id]
    });
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/posts/:id', adminRequired, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM posts WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload post images → Cloudinary
app.post('/api/upload', adminRequired, upload.array('images', 9), async (req, res) => {
  try {
    const urls = await Promise.all(
      req.files.map(f => uploadToCloudinary(f.buffer, 'vantis/posts'))
    );
    res.json({ urls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- API: Likes ----

app.post('/api/posts/:id/like', authRequired, async (req, res) => {
  try {
    const postId = req.params.id;
    const existing = await db.execute({
      sql: 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
      args: [postId, req.user.id]
    });
    if (existing.rows.length > 0) {
      await db.execute({ sql: 'DELETE FROM likes WHERE id = ?', args: [existing.rows[0].id] });
      res.json({ liked: false });
    } else {
      await db.execute({
        sql: 'INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
        args: [postId, req.user.id]
      });
      res.json({ liked: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- API: Comments ----

app.post('/api/posts/:id/comments', authRequired, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: '评论不能为空' });
    const result = await db.execute({
      sql: 'INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)',
      args: [req.params.id, req.user.id, body.trim()]
    });
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- SPA fallback ----
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Boot ----
async function start() {
  await initDB();
  // Local dev only — Vercel does not call app.listen()
  if (require.main === module) {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  }
}

start().catch(console.error);

// Export for Vercel serverless
module.exports = app;
