/* ============================================================
   yingyi.ma — Blog + Status main.js v5
   API-backed version (Node + SQLite)
   ============================================================ */

(function () {
  'use strict';

  /* ==== API helper ==== */
  const API = '/api';
  let token = localStorage.getItem('blog_token') || '';

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  /* ==== Emoji data ==== */
  const EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆',
    '😉','😊','😋','😎','😍','🥰','😘','😗',
    '🤔','🤨','😐','😑','😶','🙄','😏','😣',
    '😥','😮','🤐','😯','😪','😫','🥱','😴',
    '😌','😛','😜','🤪','😝','🤑','🤗','🤭',
    '🤫','🤥','😬','😈','👿','💀','👻','👽',
    '🤖','💩','😺','😸','😹','😻','😼','😽',
    '👍','👎','👏','🙌','🤝','🙏','💪','🔥',
    '⭐','🌟','💫','✨','🎉','🎊','🎈','🎁',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍',
    '💯','💢','💥','💫','💦','💨','🕳️','💣',
    '🏠','🚀','✈️','🌍','🌈','☀️','🌙','⛅',
    '🍕','🍔','🍟','🌮','🍜','🍣','🍰','☕',
    '📱','💻','⌨️','🖥️','📷','🎮','🎵','🎬',
    '📚','📝','✏️','📌','📎','🔗','🔑','🛠️',
  ];

  /* ==== Tiny Markdown parser ==== */
  function md(src) {
    if (!src) return '';
    let h = src;
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => '<pre><code>' + esc(c.trimEnd()) + '</code></pre>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/^---$/gm, '<hr>');
    h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)/g, m => '<ul>' + m + '</ul>');
    h = h.replace(/<\/ul>\s*<ul>/g, '');
    h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^(?!<[a-z/])((?!<\/)[^\n]+)$/gm, '<p>$1</p>');
    h = h.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');
    return h;
  }

  /* ==== Helpers ==== */
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/"/g, '&quot;'); }
  function stripMd(s) {
    return s.replace(/```[\s\S]*?```/g, '').replace(/[#*>`~\[\]!()-]/g, '').replace(/\n+/g, ' ').trim();
  }

  /* ==== State ==== */
  let auth = JSON.parse(localStorage.getItem('blog_auth') || 'null'); // { role, nickname, id }
  let profile = { name: 'yingyi.ma', bio: '', avatar_url: '' };
  let posts = [];
  let theme = localStorage.getItem('blog_theme') || 'light';
  let currentFilter = 'all';

  const isAdmin = () => auth && auth.role === 'admin';
  const loggedIn = () => !!auth;
  const who = () => !auth ? null : auth.nickname;
  const myId = () => auth ? auth.id : null;

  /* ==== Theme ==== */
  function applyTheme() { document.documentElement.setAttribute('data-theme', theme); }
  applyTheme();
  $('#themeToggle').addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('blog_theme', theme);
    applyTheme();
  });

  /* ==== Modals ==== */
  function open(id) { document.getElementById(id).classList.add('open'); }
  function close(id) { document.getElementById(id).classList.remove('open'); }
  $$('.modal-x').forEach(b => b.addEventListener('click', () => close(b.dataset.close)));
  $$('.modal-mask').forEach(m => m.addEventListener('click', e => { if (e.target === m) close(m.id); }));

  /* ==== Login switch ==== */
  $('#toAdmin').addEventListener('click', () => { $('#loginVisitor').classList.remove('active'); $('#loginAdmin').classList.add('active'); });
  $('#toVisitor').addEventListener('click', () => { $('#loginAdmin').classList.remove('active'); $('#loginVisitor').classList.add('active'); });

  /* ==== Emoji picker ==== */
  function buildEmojiPicker(pickerId, textareaId) {
    const picker = document.getElementById(pickerId);
    picker.innerHTML = EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
    picker.addEventListener('click', e => {
      const emoji = e.target.dataset.emoji;
      if (!emoji) return;
      const ta = document.getElementById(textareaId);
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
    });
  }
  buildEmojiPicker('statusEmojiPicker', 'statusInput');
  buildEmojiPicker('blogEmojiPicker', 'blogBodyInput');

  $('#statusEmojiBtn').addEventListener('click', () => {
    const p = $('#statusEmojiPicker');
    p.style.display = p.style.display === 'none' ? 'grid' : 'none';
  });
  $('#blogEmojiBtn').addEventListener('click', () => {
    const p = $('#blogEmojiPicker');
    p.style.display = p.style.display === 'none' ? 'grid' : 'none';
  });

  /* ==== Time ==== */
  function formatDate(ts) {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function timeAgo(ts) {
    const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    const d = Math.floor(h / 24);
    if (d < 7) return d + ' 天前';
    return formatDate(ts);
  }

  /* ==== Render profile ==== */
  function renderProfile() {
    const setAvatar = (el) => {
      if (profile.avatar_url) el.innerHTML = `<img src="${escAttr(profile.avatar_url)}" />`;
      else el.textContent = (profile.name || 'Y').charAt(0).toUpperCase();
    };
    setAvatar($('#navAvatar'));
    setAvatar($('#heroAvatar'));
    const p = $('#avatarPreview');
    if (p) setAvatar(p);
    $('#heroName').textContent = profile.name;
    $('#heroBio').textContent = profile.bio;
    $('#navLogoText').textContent = profile.name;
  }

  /* ==== Render auth ==== */
  function renderAuth() {
    const btn = $('#loginBtn');
    if (loggedIn()) {
      btn.textContent = '退出';
      btn.className = 'nav-login logout';
    } else {
      btn.textContent = '登录';
      btn.className = 'nav-login';
    }
    $('#toolbar').style.display = isAdmin() ? 'flex' : 'none';
  }

  /* ==== SVGs ==== */
  const heartSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const commentSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const TRUNCATE_LEN = 200;

  /* ==== Render posts ==== */
  function renderPosts() {
    const list = $('#postList');
    const filtered = posts.filter(p => currentFilter === 'all' || p.type === currentFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<p class="post-empty">${posts.length === 0 ? '还没有内容' : '没有匹配的内容'}</p>`;
      renderAuth();
      return;
    }

    list.innerHTML = filtered.map(p => {
      const uid = myId();
      const liked = uid && p.likes.some(l => l.user_id === uid);
      const isBlog = p.type === 'blog';

      const badge = `<span class="post-type-badge ${p.type}">${isBlog ? '文章' : '动态'}</span>`;

      let bodyHtml = '';
      if (isBlog) {
        const plain = stripMd(p.body);
        const trunc = plain.length > TRUNCATE_LEN;
        bodyHtml = `<div class="post-card-body${trunc ? ' truncated' : ''}"><div class="md-body">${md(p.body)}</div></div>`;
        if (trunc) bodyHtml += `<button class="read-more" data-act="read-more" data-id="${p.id}">阅读全文</button>`;
      } else {
        bodyHtml = `<div class="post-status-text">${esc(p.body)}</div>`;
      }

      let headerHtml = '';
      if (isBlog) {
        headerHtml = `
          <div class="post-card-header">
            <h3 class="post-card-title" data-act="open-detail" data-id="${p.id}">${badge}${esc(p.title)}</h3>
            <span class="post-card-date">${formatDate(p.created_at)}</span>
          </div>`;
      } else {
        headerHtml = `
          <div class="post-card-header">
            <span>${badge}<span class="post-card-date">${timeAgo(p.created_at)}</span></span>
          </div>`;
      }

      const imgs = p.images.length
        ? `<div class="post-card-images">${p.images.map(s => `<img src="${escAttr(s)}" />`).join('')}</div>`
        : '';

      const likesRow = p.likes.length
        ? `<div class="post-likes">${heartSvg} ${p.likes.map(l => esc(l.nickname)).join('，')}</div>`
        : '';

      const commentsBlock = p.comments.length
        ? `<div class="post-comments">${p.comments.map(c => `<div class="comment-row"><b>${esc(c.nickname)}</b>${esc(c.body)}</div>`).join('')}</div>`
        : '';

      const commentForm = loggedIn()
        ? `<div class="comment-form" data-id="${p.id}" style="display:none;"><input type="text" placeholder="写评论..." /><button>发送</button></div>`
        : '';

      return `
      <article class="post-card" data-id="${p.id}" data-type="${p.type}">
        <button class="post-delete-btn" data-id="${p.id}" title="删除">&times;</button>
        ${headerHtml}
        ${bodyHtml}
        ${imgs}
        <div class="post-actions">
          <button class="post-act-btn${liked ? ' liked' : ''}" data-act="like" data-id="${p.id}">
            ${heartSvg} <span>${p.likes.length || ''}</span>
          </button>
          <button class="post-act-btn" data-act="toggle-comment" data-id="${p.id}">
            ${commentSvg} <span>${p.comments.length || ''}</span>
          </button>
        </div>
        ${likesRow}
        ${commentsBlock}
        ${commentForm}
      </article>`;
    }).join('');

    $$('.post-delete-btn').forEach(b => { b.style.display = isAdmin() ? 'block' : 'none'; });
  }

  /* ==== Filter ==== */
  $$('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderPosts();
    });
  });

  /* ==== Detail ==== */
  function openDetail(id) {
    const p = posts.find(x => x.id === id);
    if (!p) return;
    $('#detailTitle').textContent = p.title || '';
    $('#detailMeta').textContent = formatDate(p.created_at);
    $('#detailContent').innerHTML = p.type === 'blog' ? md(p.body) : `<p style="white-space:pre-wrap;">${esc(p.body)}</p>`;
    $('#detailImages').innerHTML = p.images.map(s => `<img src="${escAttr(s)}" />`).join('');
    open('detailModal');
  }

  /* ==== Load data from API ==== */
  async function loadProfile() {
    try {
      profile = await api('/profile');
      renderProfile();
    } catch (e) { console.error('Load profile:', e); }
  }

  async function loadPosts() {
    try {
      posts = await api('/posts');
      renderPosts();
    } catch (e) { console.error('Load posts:', e); }
  }

  /* ==== Upload images ==== */
  async function uploadImages(files) {
    if (!files.length) return [];
    const form = new FormData();
    files.forEach(f => form.append('images', f));
    const data = await api('/upload', { method: 'POST', body: form });
    return data.urls;
  }

  /* ==== Login ==== */
  $('#loginBtn').addEventListener('click', () => {
    if (loggedIn()) {
      auth = null; token = '';
      localStorage.removeItem('blog_auth');
      localStorage.removeItem('blog_token');
      renderAuth(); renderPosts();
    } else {
      $('#visitorName').value = ''; $('#visitorContact').value = ''; $('#adminPass').value = '';
      $('#loginAdmin').classList.remove('active'); $('#loginVisitor').classList.add('active');
      open('loginModal');
    }
  });

  $('#visitorSubmit').addEventListener('click', async () => {
    const nickname = $('#visitorName').value.trim();
    const contact = $('#visitorContact').value.trim();
    if (!nickname) { alert('请填写昵称'); return; }
    if (!contact) { alert('请填写邮箱或手机号'); return; }
    try {
      const data = await api('/auth/visitor', { method: 'POST', body: { nickname, contact } });
      token = data.token;
      auth = data.user;
      localStorage.setItem('blog_token', token);
      localStorage.setItem('blog_auth', JSON.stringify(auth));
      close('loginModal');
      renderAuth(); loadPosts();
    } catch (e) { alert(e.message); }
  });

  $('#adminSubmit').addEventListener('click', async () => {
    const username = $('#adminUser').value.trim();
    const password = $('#adminPass').value.trim();
    try {
      const data = await api('/auth/admin', { method: 'POST', body: { username, password } });
      token = data.token;
      auth = data.user;
      localStorage.setItem('blog_token', token);
      localStorage.setItem('blog_auth', JSON.stringify(auth));
      close('loginModal');
      renderAuth(); loadPosts();
    } catch (e) { alert(e.message); }
  });

  /* ==== Profile ==== */
  let pendingAvatarFile = null;

  $('#editProfileBtn').addEventListener('click', () => {
    $('#profileNameInput').value = profile.name;
    $('#profileBioInput').value = profile.bio;
    pendingAvatarFile = null;
    const pv = $('#avatarPreview');
    if (profile.avatar_url) pv.innerHTML = `<img src="${escAttr(profile.avatar_url)}" />`;
    else pv.textContent = (profile.name || 'Y').charAt(0).toUpperCase();
    open('profileModal');
  });

  $('#avatarFileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    pendingAvatarFile = file;
    const r = new FileReader();
    r.onload = ev => { $('#avatarPreview').innerHTML = `<img src="${escAttr(ev.target.result)}" />`; };
    r.readAsDataURL(file);
    e.target.value = '';
  });

  $('#profileSave').addEventListener('click', async () => {
    try {
      // upload avatar if changed
      if (pendingAvatarFile) {
        const form = new FormData();
        form.append('avatar', pendingAvatarFile);
        await api('/profile/avatar', { method: 'POST', body: form });
        pendingAvatarFile = null;
      }
      await api('/profile', {
        method: 'PUT',
        body: {
          name: $('#profileNameInput').value.trim() || 'yingyi.ma',
          bio: $('#profileBioInput').value.trim() || ''
        }
      });
      close('profileModal');
      loadProfile();
    } catch (e) { alert(e.message); }
  });

  /* ==== New status ==== */
  let statusFiles = [];

  $('#newStatusBtn').addEventListener('click', () => {
    $('#statusInput').value = ''; $('#statusImgThumbs').innerHTML = '';
    $('#statusEmojiPicker').style.display = 'none';
    statusFiles = []; open('statusModal');
  });

  $('#statusImageInput').addEventListener('change', e => {
    Array.from(e.target.files).forEach(f => {
      statusFiles.push(f);
      const r = new FileReader();
      r.onload = ev => {
        const img = document.createElement('img');
        img.src = ev.target.result;
        $('#statusImgThumbs').appendChild(img);
      };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  });

  $('#statusSubmit').addEventListener('click', async () => {
    const text = $('#statusInput').value.trim();
    if (!text && !statusFiles.length) return;
    try {
      const images = await uploadImages(statusFiles);
      await api('/posts', { method: 'POST', body: { type: 'status', title: '', body: text, images } });
      statusFiles = []; close('statusModal'); loadPosts();
    } catch (e) { alert(e.message); }
  });

  /* ==== New blog ==== */
  let blogFiles = [];

  $('#newBlogBtn').addEventListener('click', () => {
    $('#blogTitleInput').value = ''; $('#blogBodyInput').value = ''; $('#blogImgThumbs').innerHTML = '';
    $('#blogEmojiPicker').style.display = 'none';
    blogFiles = []; open('blogModal');
  });

  $('#blogImageInput').addEventListener('change', e => {
    Array.from(e.target.files).forEach(f => {
      blogFiles.push(f);
      const r = new FileReader();
      r.onload = ev => {
        const img = document.createElement('img');
        img.src = ev.target.result;
        $('#blogImgThumbs').appendChild(img);
      };
      r.readAsDataURL(f);
    });
    e.target.value = '';
  });

  $('#blogSubmit').addEventListener('click', async () => {
    const title = $('#blogTitleInput').value.trim();
    const text = $('#blogBodyInput').value.trim();
    if (!title && !text && !blogFiles.length) return;
    try {
      const images = await uploadImages(blogFiles);
      await api('/posts', { method: 'POST', body: { type: 'blog', title: title || '无题', body: text, images } });
      blogFiles = []; close('blogModal'); loadPosts();
    } catch (e) { alert(e.message); }
  });

  /* ==== Feed events ==== */
  $('#postList').addEventListener('click', async e => {
    const t = e.target;

    // delete
    const delBtn = t.closest('.post-delete-btn');
    if (delBtn) {
      if (confirm('确定删除？')) {
        try {
          await api('/posts/' + delBtn.dataset.id, { method: 'DELETE' });
          loadPosts();
        } catch (e) { alert(e.message); }
      }
      return;
    }

    // detail
    if (t.dataset.act === 'open-detail' || t.dataset.act === 'read-more') {
      openDetail(+t.dataset.id);
      return;
    }

    // like
    const likeBtn = t.closest('[data-act="like"]');
    if (likeBtn) {
      if (!loggedIn()) { open('loginModal'); return; }
      try {
        await api('/posts/' + likeBtn.dataset.id + '/like', { method: 'POST' });
        loadPosts();
      } catch (e) { alert(e.message); }
      return;
    }

    // toggle comment form
    const cmtBtn = t.closest('[data-act="toggle-comment"]');
    if (cmtBtn) {
      if (!loggedIn()) { open('loginModal'); return; }
      const form = document.querySelector(`.comment-form[data-id="${cmtBtn.dataset.id}"]`);
      if (form) {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        if (form.style.display === 'flex') form.querySelector('input').focus();
      }
      return;
    }

    // send comment
    const sendBtn = t.closest('.comment-form button');
    if (sendBtn) {
      const form = sendBtn.closest('.comment-form');
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      if (!loggedIn()) { open('loginModal'); return; }
      try {
        await api('/posts/' + form.dataset.id + '/comments', { method: 'POST', body: { body: text } });
        loadPosts();
      } catch (e) { alert(e.message); }
      return;
    }
  });

  /* ==== Init ==== */
  renderAuth();
  loadProfile();
  loadPosts();

})();
