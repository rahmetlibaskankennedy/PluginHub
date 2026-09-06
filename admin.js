// PluginHub eklenti admin paneli.
// Kimlik doğrulama: Cloudflare Worker'da ayarlanan ADMIN_TOKEN secret'ıyla
// eşleşen bir parola. Token, sadece bu tarayıcıda kalsın diye localStorage'da
// tutuluyor — sunucu tarafında oturum/kullanıcı kavramı yok (SınavRotası'ndaki
// gibi Supabase auth değil, tek-parolalı basit bir koruma).
const WORKER_BASE = 'https://pluginhub.sait-yldrm.workers.dev';
const TOKEN_KEY = 'pluginhub_admin_token';

let currentPlugins = [];
let editingId = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = isError ? 'toast show error' : 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ---------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------
async function tryLogin(token) {
  const res = await fetch(`${WORKER_BASE}/admin/plugins`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const pw = document.getElementById('loginPassword').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!pw) return;
  try {
    const ok = await tryLogin(pw);
    if (!ok) {
      errEl.textContent = 'Parola yanlış.';
      errEl.style.display = 'block';
      return;
    }
    localStorage.setItem(TOKEN_KEY, pw);
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    loadPlugins();
  } catch (e) {
    errEl.textContent = 'Bağlanılamadı: ' + e.message;
    errEl.style.display = 'block';
  }
});
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
  document.getElementById('loginPassword').value = '';
});

// ---------------------------------------------------------------------
// Liste yükleme / render
// ---------------------------------------------------------------------
async function loadPlugins() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
  try {
    const res = await fetch(`${WORKER_BASE}/admin/plugins`, { headers: authHeaders() });
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentPlugins = await res.json();
    renderList();
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Yüklenemedi: ${escapeHtml(e.message)}</div>`;
  }
}

function signOutForced() {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
  showToast('Oturum geçersiz, tekrar giriş yap.', true);
}

function renderList() {
  const q = (document.getElementById('searchInput').value || '').toLocaleLowerCase('tr-TR');
  const rows = currentPlugins.filter(p => !q || (p.name || '').toLocaleLowerCase('tr-TR').includes(q));
  document.getElementById('listSub').textContent = `${rows.length} / ${currentPlugins.length} eklenti`;
  const content = document.getElementById('content');
  if (!rows.length) {
    content.innerHTML = '<div class="empty-state">Sonuç bulunamadı.</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'plugin-table';
  table.innerHTML = `<thead><tr><th>Başlık</th><th>Tür</th><th>Uygulama</th><th>Durum</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach(p => {
    const tr = document.createElement('tr');
    const appStr = (p.app || []).join(', ') || '—';
    const statusHTML = p.status === 'dead' ? '<span class="badge dead">Çalışmıyor</span>' : '<span class="badge ok">Aktif</span>';
    const ageHTML = p.ageRestricted ? ' <span class="badge age">18+</span>' : '';
    tr.innerHTML = `<td>${escapeHtml(p.name || '')}</td><td>${escapeHtml(p.type || '')}</td><td>${escapeHtml(appStr)}</td><td>${statusHTML}${ageHTML}</td><td><button class="btn small" data-edit="${p.id}">Düzenle</button></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  content.innerHTML = '';
  content.appendChild(table);
  content.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
}

document.getElementById('searchInput').addEventListener('input', renderList);

// ---------------------------------------------------------------------
// Ekle/Düzenle modal
// ---------------------------------------------------------------------
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openModal(id = null) {
  editingId = id;
  const overlay = document.getElementById('pluginModalOverlay');
  const form = document.getElementById('pluginForm');
  form.reset();
  document.querySelectorAll('#pluginForm input[type=checkbox][name]').forEach(cb => cb.checked = false);

  if (id) {
    const p = currentPlugins.find(x => x.id === id);
    document.getElementById('modalTitle').textContent = 'Eklentiyi Düzenle';
    document.getElementById('fName').value = p.name || '';
    document.getElementById('fDesc').value = p.desc || '';
    document.getElementById('fType').value = p.type || '';
    document.getElementById('fDebrid').value = p.debrid || 'free';
    document.getElementById('fInstallGuide').value = p.installGuide || 'nuvio';
    document.getElementById('fDateAdded').value = p.dateAdded || todayISO();
    document.getElementById('fStatus').value = p.status || '';
    document.getElementById('fAgeRestricted').checked = Boolean(p.ageRestricted);
    (p.app || []).forEach(a => {
      const cb = form.querySelector(`input[name=app][value="${a}"]`);
      if (cb) cb.checked = true;
    });
    (p.platform || []).forEach(pl => {
      const cb = form.querySelector(`input[name=platform][value="${pl}"]`);
      if (cb) cb.checked = true;
    });
    document.getElementById('deletePluginBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('modalTitle').textContent = 'Yeni Eklenti';
    document.getElementById('fDateAdded').value = todayISO();
    document.getElementById('deletePluginBtn').style.display = 'none';
  }
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('pluginModalOverlay').classList.remove('open');
  editingId = null;
}

document.getElementById('newPluginBtn').addEventListener('click', () => openModal(null));
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('pluginModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'pluginModalOverlay') closeModal();
});

document.getElementById('pluginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: document.getElementById('fName').value.trim(),
    desc: document.getElementById('fDesc').value.trim(),
    type: document.getElementById('fType').value.trim(),
    debrid: document.getElementById('fDebrid').value,
    installGuide: document.getElementById('fInstallGuide').value,
    dateAdded: document.getElementById('fDateAdded').value,
    status: document.getElementById('fStatus').value,
    ageRestricted: document.getElementById('fAgeRestricted').checked,
    app: [...form.querySelectorAll('input[name=app]:checked')].map(cb => cb.value),
    platform: [...form.querySelectorAll('input[name=platform]:checked')].map(cb => cb.value)
  };
  try {
    let res;
    if (editingId) {
      res = await fetch(`${WORKER_BASE}/admin/plugins`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: editingId, ...payload }) });
    } else {
      res = await fetch(`${WORKER_BASE}/admin/plugins`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    }
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    showToast(editingId ? 'Güncellendi.' : 'Eklendi.');
    closeModal();
    loadPlugins();
  } catch (err) {
    showToast('Kaydedilemedi: ' + err.message, true);
  }
});

document.getElementById('deletePluginBtn').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Bu eklentiyi silmek istediğine emin misin?')) return;
  try {
    const res = await fetch(`${WORKER_BASE}/admin/plugins?id=${encodeURIComponent(editingId)}`, { method: 'DELETE', headers: authHeaders() });
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    showToast('Silindi.');
    closeModal();
    loadPlugins();
  } catch (err) {
    showToast('Silinemedi: ' + err.message, true);
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sayfa açılışında kayıtlı token varsa doğrudan giriş yapmayı dene.
(async function boot() {
  const token = getToken();
  if (!token) return;
  try {
    const ok = await tryLogin(token);
    if (ok) {
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('adminApp').style.display = 'block';
      loadPlugins();
    }
  } catch {
    // sessizce giriş ekranında kal
  }
})();
