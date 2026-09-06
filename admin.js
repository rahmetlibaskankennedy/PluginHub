// PluginHub yönetim paneli — eklentiler + TV/Mobil/Spor uygulamaları.
// Kimlik doğrulama: Cloudflare Worker'da ayarlanan ADMIN_TOKEN secret'ıyla
// eşleşen tek bir parola (SınavRotası'ndaki gibi kullanıcı bazlı Supabase
// auth değil — tek yönetici için orantılı, basit bir koruma).
const WORKER_BASE = 'https://pluginhub.sait-yldrm.workers.dev';
const TOKEN_KEY = 'pluginhub_admin_token';

// Her sekmenin hangi uç noktayı/şemayı kullandığını tanımlar.
const TAB_CONFIG = {
  plugins: {
    label: 'Eklentiler',
    listUrl: () => `${WORKER_BASE}/admin/plugins`,
    saveUrl: () => `${WORKER_BASE}/admin/plugins`,
    deleteUrl: (id) => `${WORKER_BASE}/admin/plugins?id=${encodeURIComponent(id)}`,
    typeOptions: ['4K', 'Altyazı', 'Canlı', 'Debrid', 'Dublaj', 'Film', 'Katalog', 'Plugin', 'Repo', 'Spor'],
    hasInstallGuide: true, hasCode: false
  },
  tv: {
    label: 'TV Uygulamaları', category: 'tv',
    listUrl: () => `${WORKER_BASE}/admin/apps?category=tv`,
    saveUrl: () => `${WORKER_BASE}/admin/apps`,
    deleteUrl: (id) => `${WORKER_BASE}/admin/apps?category=tv&id=${encodeURIComponent(id)}`,
    typeOptions: ['Stream', 'YouTube İstemcisi', 'Film/Dizi', 'Film/Dizi/Canlı TV', 'Kompakt Medya Portalı'],
    hasInstallGuide: false, hasCode: true
  },
  mobile: {
    label: 'Mobil Uygulamaları', category: 'mobile',
    listUrl: () => `${WORKER_BASE}/admin/apps?category=mobile`,
    saveUrl: () => `${WORKER_BASE}/admin/apps`,
    deleteUrl: (id) => `${WORKER_BASE}/admin/apps?category=mobile&id=${encodeURIComponent(id)}`,
    typeOptions: ['Stream', 'Film/Dizi/Canlı TV', 'Film/Dizi', 'Müzik Uygulaması'],
    hasInstallGuide: false, hasCode: true
  },
  sport: {
    label: 'Spor Uygulamaları', category: 'sport',
    listUrl: () => `${WORKER_BASE}/admin/apps?category=sport`,
    saveUrl: () => `${WORKER_BASE}/admin/apps`,
    deleteUrl: (id) => `${WORKER_BASE}/admin/apps?category=sport&id=${encodeURIComponent(id)}`,
    typeOptions: ['Canlı'],
    hasInstallGuide: false, hasCode: true
  }
};

let activeTab = 'plugins';
let currentItems = [];
let editingId = null;

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' }; }

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = isError ? 'toast show error' : 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    if (!ok) { errEl.textContent = 'Parola yanlış.'; errEl.style.display = 'block'; return; }
    localStorage.setItem(TOKEN_KEY, pw);
    enterApp();
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

function signOutForced() {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
  showToast('Oturum geçersiz, tekrar giriş yap.', true);
}

function enterApp() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  loadItems();
}

// ---------------------------------------------------------------------
// Sekmeler
// ---------------------------------------------------------------------
document.querySelectorAll('#tabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('searchInput').value = '';
    loadItems();
  });
});

// ---------------------------------------------------------------------
// Liste yükleme / render
// ---------------------------------------------------------------------
async function loadItems() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
  try {
    const res = await fetch(TAB_CONFIG[activeTab].listUrl(), { headers: authHeaders() });
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentItems = await res.json();
    renderList();
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Yüklenemedi: ${escapeHtml(e.message)}</div>`;
  }
}

function renderList() {
  const q = (document.getElementById('searchInput').value || '').toLocaleLowerCase('tr-TR');
  const rows = currentItems.filter(p => !q || (p.name || '').toLocaleLowerCase('tr-TR').includes(q));
  document.getElementById('listSub').textContent = `${rows.length} / ${currentItems.length} kayıt — ${TAB_CONFIG[activeTab].label}`;
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
// Ekle/Düzenle modal — alanlar aktif sekmeye göre gösterilir/gizlenir
// ---------------------------------------------------------------------
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function applyTabFieldVisibility() {
  const cfg = TAB_CONFIG[activeTab];
  document.getElementById('debridField').style.display = cfg.hasInstallGuide ? '' : 'none';
  document.getElementById('installGuideField').style.display = cfg.hasInstallGuide ? '' : 'none';
  document.getElementById('appOnlyDateRow').style.display = cfg.hasInstallGuide ? 'none' : '';
  document.getElementById('codeSourceRow').style.display = cfg.hasCode ? '' : 'none';
  document.getElementById('ageField').style.display = activeTab === 'plugins' ? '' : 'none';
  const typeList = document.getElementById('typeOptions');
  typeList.innerHTML = cfg.typeOptions.map(t => `<option value="${escapeHtml(t)}">`).join('');
}

function openModal(id = null) {
  editingId = id;
  applyTabFieldVisibility();
  const overlay = document.getElementById('itemModalOverlay');
  const form = document.getElementById('itemForm');
  form.reset();
  document.querySelectorAll('#itemForm input[type=checkbox][name]').forEach(cb => cb.checked = false);
  const dateField = TAB_CONFIG[activeTab].hasInstallGuide ? 'fDateAdded' : 'fDateAdded2';

  if (id) {
    const p = currentItems.find(x => x.id === id);
    document.getElementById('modalTitle').textContent = 'Kaydı Düzenle';
    document.getElementById('fName').value = p.name || '';
    document.getElementById('fDesc').value = p.desc || '';
    document.getElementById('fType').value = p.type || '';
    document.getElementById('fDebrid').value = p.debrid || 'free';
    document.getElementById('fInstallGuide').value = p.installGuide || 'nuvio';
    document.getElementById(dateField).value = p.dateAdded || todayISO();
    document.getElementById('fStatus').value = p.status || '';
    document.getElementById('fAgeRestricted').checked = Boolean(p.ageRestricted);
    document.getElementById('fCode').value = p.code || '';
    document.getElementById('fSourceUrl').value = p.sourceUrl || '';
    (p.app || []).forEach(a => { const cb = form.querySelector(`input[name=app][value="${a}"]`); if (cb) cb.checked = true; });
    (p.platform || []).forEach(pl => { const cb = form.querySelector(`input[name=platform][value="${pl}"]`); if (cb) cb.checked = true; });
    document.getElementById('deleteItemBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('modalTitle').textContent = 'Yeni ' + (activeTab === 'plugins' ? 'Eklenti' : 'Uygulama');
    document.getElementById(dateField).value = todayISO();
    document.getElementById('deleteItemBtn').style.display = 'none';
  }
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('itemModalOverlay').classList.remove('open');
  editingId = null;
}

document.getElementById('newItemBtn').addEventListener('click', () => openModal(null));
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('itemModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'itemModalOverlay') closeModal();
});

document.getElementById('itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const cfg = TAB_CONFIG[activeTab];
  const dateField = cfg.hasInstallGuide ? 'fDateAdded' : 'fDateAdded2';
  const payload = {
    name: document.getElementById('fName').value.trim(),
    desc: document.getElementById('fDesc').value.trim(),
    type: document.getElementById('fType').value.trim(),
    dateAdded: document.getElementById(dateField).value,
    status: document.getElementById('fStatus').value,
    app: [...form.querySelectorAll('input[name=app]:checked')].map(cb => cb.value),
    platform: [...form.querySelectorAll('input[name=platform]:checked')].map(cb => cb.value)
  };
  if (cfg.hasInstallGuide) {
    payload.debrid = document.getElementById('fDebrid').value;
    payload.installGuide = document.getElementById('fInstallGuide').value;
    payload.ageRestricted = document.getElementById('fAgeRestricted').checked;
  }
  if (cfg.hasCode) {
    payload.category = cfg.category;
    payload.code = document.getElementById('fCode').value.trim();
    payload.sourceUrl = document.getElementById('fSourceUrl').value.trim();
  }
  try {
    let res;
    if (editingId) {
      res = await fetch(cfg.saveUrl(), { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: editingId, ...payload }) });
    } else {
      res = await fetch(cfg.saveUrl(), { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    }
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    showToast(editingId ? 'Güncellendi.' : 'Eklendi.');
    closeModal();
    loadItems();
  } catch (err) {
    showToast('Kaydedilemedi: ' + err.message, true);
  }
});

document.getElementById('deleteItemBtn').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Bu kaydı silmek istediğine emin misin?')) return;
  try {
    const res = await fetch(TAB_CONFIG[activeTab].deleteUrl(editingId), { method: 'DELETE', headers: authHeaders() });
    if (res.status === 401) { signOutForced(); return; }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
    showToast('Silindi.');
    closeModal();
    loadItems();
  } catch (err) {
    showToast('Silinemedi: ' + err.message, true);
  }
});

// Sayfa açılışında kayıtlı token varsa doğrudan giriş yapmayı dene.
(async function boot() {
  const token = getToken();
  if (!token) return;
  try {
    const ok = await tryLogin(token);
    if (ok) enterApp();
  } catch {
    // sessizce giriş ekranında kal
  }
})();
