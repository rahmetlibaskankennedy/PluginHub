// PluginHub yönetim paneli — Firebase Auth + Firestore.
// Kataloglar artık Cloudflare Worker/KV yerine Firestore'da tutulur:
// catalogs/plugins, catalogs/tv, catalogs/mobile, catalogs/sport

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDKu0Xx3xYx_QrKX-h5nNJqr19JcxFu_Nw',
  authDomain: 'streamrehber.firebaseapp.com',
  projectId: 'streamrehber',
  storageBucket: 'streamrehber.firebasestorage.app',
  messagingSenderId: '234978095149',
  appId: '1:234978095149:web:04ee7a89e584d91ff4c8a4',
  measurementId: 'G-5PH5QMDS27'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Her sekmenin Firestore belgesini ve form seçeneklerini tanımlar.
const TAB_CONFIG = {
  plugins: {
    label: 'Eklentiler',
    docId: 'plugins',
    typeOptions: ['4K', 'Altyazı', 'Canlı', 'Debrid', 'Dublaj', 'Film', 'Katalog', 'Plugin', 'Repo', 'Spor'],
    appOptions: ['Nuvio', 'Stremio', 'CloudStream'],
    hasInstallGuide: true,
    hasCode: false
  },
  tv: {
    label: 'TV Uygulamaları',
    docId: 'tv',
    typeOptions: ['Stream', 'YouTube İstemcisi', 'Film/Dizi', 'Film/Dizi/Canlı TV', 'Kompakt Medya Portalı'],
    appOptions: ['Android TV', 'Apple TV', 'Tizen', 'webOS', 'FireOS'],
    hasInstallGuide: false,
    hasCode: true
  },
  mobile: {
    label: 'Mobil Uygulamaları',
    docId: 'mobile',
    typeOptions: ['Stream', 'Film/Dizi/Canlı TV', 'Film/Dizi', 'Müzik Uygulaması'],
    appOptions: ['Android', 'iOS'],
    hasInstallGuide: false,
    hasCode: true
  },
  sport: {
    label: 'Spor Uygulamaları',
    docId: 'sport',
    typeOptions: ['Canlı'],
    appOptions: ['Android TV', 'Android', 'iOS', 'Apple TV'],
    hasInstallGuide: false,
    hasCode: true
  }
};

const LAST_EMAIL_KEY = 'pluginhub_admin_email';
let activeTab = 'plugins';
let currentItems = [];
let currentCategories = [];
let editingId = null;
let booted = false;

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = isError ? 'toast show error' : 'toast show';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'E-posta veya parola yanlış.';
  }
  if (code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.';
  if (code === 'auth/network-request-failed') return 'Firebase bağlantısı kurulamadı. İnternet bağlantını kontrol et.';
  return err?.message || 'Giriş başarısız.';
}

function friendlyFirestoreError(err) {
  const code = err?.code || '';
  if (code === 'permission-denied') return 'Firestore yazma izni yok. Rules içindeki yönetici UID’sini kontrol et.';
  if (code === 'unavailable') return 'Firestore şu anda ulaşılamıyor. Bağlantını kontrol et.';
  return err?.message || 'İşlem başarısız.';
}

function enterApp(user) {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  document.getElementById('adminUserLabel').textContent = user?.email || '';
  if (!booted) {
    booted = true;
    loadItems();
  }
}

function leaveApp() {
  booted = false;
  currentItems = [];
  currentCategories = [];
  editingId = null;
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginGate').style.display = 'flex';
  document.getElementById('adminUserLabel').textContent = '';
  document.getElementById('loginPassword').value = '';
}

// ---------------------------------------------------------------------
// Giriş — Firebase Authentication
// ---------------------------------------------------------------------
document.getElementById('loginEmail').value = localStorage.getItem(LAST_EMAIL_KEY) || '';

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errEl.style.display = 'none';
  if (!email || !password) {
    errEl.textContent = 'E-posta ve parola gerekli.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';
  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem(LAST_EMAIL_KEY, email);
    enterApp(cred.user);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err);
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
  }
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});
document.getElementById('loginEmail').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginPassword').focus();
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  try { await signOut(auth); }
  catch (err) { showToast('Çıkış yapılamadı: ' + friendlyAuthError(err), true); }
});

onAuthStateChanged(auth, (user) => {
  if (user) enterApp(user);
  else leaveApp();
});

// ---------------------------------------------------------------------
// Sekmeler
// ---------------------------------------------------------------------
document.querySelectorAll('#tabs .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('searchInput').value = '';
    closeCategoryModal();
    loadItems();
  });
});

// ---------------------------------------------------------------------
// Firestore yardımcıları
// ---------------------------------------------------------------------
function catalogRef(tab = activeTab) {
  return doc(db, 'catalogs', TAB_CONFIG[tab].docId);
}

function normalizeItems(raw) {
  return Array.isArray(raw) ? raw : [];
}

function normalizeCategories(raw, items = []) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];

  const add = (value) => {
    const name = String(value ?? '').trim();
    if (!name) return;
    const key = name.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };

  source.forEach(add);
  // Eski verilerde categories alanı olmayabilir. Tür değerlerini kaybetmemek
  // için kayıtların type alanlarını listenin sonuna otomatik ekliyoruz.
  items.forEach(item => add(item?.type));
  return out;
}

async function readCatalog(tab = activeTab) {
  const snap = await getDoc(catalogRef(tab));
  if (!snap.exists()) throw new Error(`catalogs/${TAB_CONFIG[tab].docId} belgesi bulunamadı.`);
  const data = snap.data() || {};
  const items = normalizeItems(data.items);
  return {
    items,
    categories: normalizeCategories(data.categories, items)
  };
}

async function mutateCatalog(tab, mutator) {
  const ref = catalogRef(tab);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error(`catalogs/${TAB_CONFIG[tab].docId} belgesi bulunamadı.`);

    const data = snap.data() || {};
    const items = normalizeItems(data.items).map(item => ({ ...item }));
    const categories = normalizeCategories(data.categories, items);
    const result = mutator(items, categories);

    tx.set(ref, {
      items,
      categories,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return result;
  });
}

// ---------------------------------------------------------------------
// Liste yükleme / render
// ---------------------------------------------------------------------
async function loadItems() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty-state">Yükleniyor…</div>';
  document.getElementById('listSub').textContent = '';

  try {
    const data = await readCatalog(activeTab);
    currentItems = data.items;
    currentCategories = data.categories;
    renderList();
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Yüklenemedi: ${escapeHtml(friendlyFirestoreError(err))}</div>`;
  }
}

function statusBadge(item) {
  if (item.status === 'dead') return '<span class="badge dead">Çalışmıyor</span>';
  if (item.status === 'warn') return '<span class="badge warn">Uyarı</span>';
  return '<span class="badge ok">Aktif</span>';
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
  table.innerHTML = '<thead><tr><th>Başlık</th><th>Tür</th><th>Uygulama</th><th>Durum</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');

  rows.forEach(p => {
    const tr = document.createElement('tr');
    const appStr = Array.isArray(p.app) ? (p.app.join(', ') || '—') : (p.app || '—');
    const ageHTML = p.ageRestricted ? ' <span class="badge age">18+</span>' : '';
    const id = p.id || '';
    tr.innerHTML = `<td>${escapeHtml(p.name || '')}</td><td>${escapeHtml(p.type || '')}</td><td>${escapeHtml(appStr)}</td><td>${statusBadge(p)}${ageHTML}</td><td><button class="btn small" data-edit="${escapeHtml(id)}" ${id ? '' : 'disabled'}>Düzenle</button></td>`;
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
// Alt kategori yönetimi
// ---------------------------------------------------------------------
function categoryNameKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function categoryUsageCount(name) {
  const key = categoryNameKey(name);
  return currentItems.filter(item => categoryNameKey(item.type) === key).length;
}

function closeCategoryModal() {
  document.getElementById('categoryModalOverlay').classList.remove('open');
  document.getElementById('newCategoryName').value = '';
}

function openCategoryModal() {
  document.getElementById('categoryModalSubtext').textContent = TAB_CONFIG[activeTab].label;
  renderCategoryManager();
  document.getElementById('categoryModalOverlay').classList.add('open');
}

function renderCategoryManager() {
  const list = document.getElementById('categoryList');
  if (!currentCategories.length) {
    list.innerHTML = '<div class="category-empty">Henüz alt kategori yok. Yukarıdan yeni bir kategori ekleyebilirsin.</div>';
    return;
  }

  list.innerHTML = currentCategories.map((name, index) => {
    const count = categoryUsageCount(name);
    return `
      <div class="category-row" data-category-index="${index}">
        <div class="category-name-wrap">
          <input class="category-name-input" type="text" maxlength="50" value="${escapeHtml(name)}" data-category-name>
          <span class="category-count">${count} kayıt</span>
        </div>
        <div class="category-order-actions">
          <button type="button" class="icon-btn" data-category-up title="Yukarı taşı" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-category-down title="Aşağı taşı" ${index === currentCategories.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <div class="category-main-actions">
          <button type="button" class="icon-btn save" data-category-save title="Adı kaydet">✓</button>
          <button type="button" class="icon-btn delete" data-category-delete title="Kategoriyi sil">×</button>
        </div>
      </div>`;
  }).join('');
}

async function refreshAfterCategoryChange() {
  const data = await readCatalog(activeTab);
  currentItems = data.items;
  currentCategories = data.categories;
  renderList();
  renderCategoryManager();
}

async function addCategory() {
  if (!auth.currentUser) return;
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) {
    showToast('Kategori adı gerekli.', true);
    input.focus();
    return;
  }
  if (currentCategories.some(c => categoryNameKey(c) === categoryNameKey(name))) {
    showToast('Bu kategori zaten var.', true);
    return;
  }

  const tabAtStart = activeTab;
  const btn = document.getElementById('addCategoryBtn');
  btn.disabled = true;
  try {
    await mutateCatalog(tabAtStart, (items, categories) => {
      if (categories.some(c => categoryNameKey(c) === categoryNameKey(name))) {
        throw new Error('Bu kategori zaten var.');
      }
      categories.push(name);
    });
    input.value = '';
    await refreshAfterCategoryChange();
    showToast('Alt kategori eklendi.');
  } catch (err) {
    showToast('Kategori eklenemedi: ' + friendlyFirestoreError(err), true);
  } finally {
    btn.disabled = false;
  }
}

async function renameCategory(index, nextName) {
  const oldName = currentCategories[index];
  nextName = String(nextName ?? '').trim();
  if (!oldName) return;
  if (!nextName) {
    showToast('Kategori adı boş olamaz.', true);
    renderCategoryManager();
    return;
  }
  if (categoryNameKey(oldName) === categoryNameKey(nextName)) {
    // Büyük/küçük harf veya biçim değişikliğini yine de kaydet.
  } else if (currentCategories.some((c, i) => i !== index && categoryNameKey(c) === categoryNameKey(nextName))) {
    showToast('Bu isimde başka bir kategori zaten var.', true);
    renderCategoryManager();
    return;
  }

  try {
    await mutateCatalog(activeTab, (items, categories) => {
      const realIndex = categories.findIndex(c => categoryNameKey(c) === categoryNameKey(oldName));
      if (realIndex === -1) throw new Error('Kategori bulunamadı.');
      if (categories.some((c, i) => i !== realIndex && categoryNameKey(c) === categoryNameKey(nextName))) {
        throw new Error('Bu isimde başka bir kategori zaten var.');
      }
      categories[realIndex] = nextName;
      items.forEach(item => {
        if (categoryNameKey(item.type) === categoryNameKey(oldName)) item.type = nextName;
      });
    });
    await refreshAfterCategoryChange();
    showToast('Kategori adı güncellendi.');
  } catch (err) {
    showToast('Kategori güncellenemedi: ' + friendlyFirestoreError(err), true);
  }
}

async function moveCategory(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= currentCategories.length) return;
  const name = currentCategories[index];
  try {
    await mutateCatalog(activeTab, (items, categories) => {
      const realIndex = categories.findIndex(c => categoryNameKey(c) === categoryNameKey(name));
      if (realIndex === -1) throw new Error('Kategori bulunamadı.');
      const realTarget = realIndex + direction;
      if (realTarget < 0 || realTarget >= categories.length) return;
      [categories[realIndex], categories[realTarget]] = [categories[realTarget], categories[realIndex]];
    });
    await refreshAfterCategoryChange();
  } catch (err) {
    showToast('Sıra değiştirilemedi: ' + friendlyFirestoreError(err), true);
  }
}

async function deleteCategory(index) {
  const name = currentCategories[index];
  if (!name) return;
  const count = categoryUsageCount(name);
  const message = count > 0
    ? `“${name}” kategorisinde ${count} kayıt var. Kategoriyi silersen bu kayıtların Tür alanı boşaltılacak. Devam edilsin mi?`
    : `“${name}” kategorisi silinsin mi?`;
  if (!confirm(message)) return;

  try {
    await mutateCatalog(activeTab, (items, categories) => {
      const realIndex = categories.findIndex(c => categoryNameKey(c) === categoryNameKey(name));
      if (realIndex === -1) throw new Error('Kategori bulunamadı.');
      categories.splice(realIndex, 1);
      items.forEach(item => {
        if (categoryNameKey(item.type) === categoryNameKey(name)) item.type = '';
      });
    });
    await refreshAfterCategoryChange();
    showToast('Kategori silindi.');
  } catch (err) {
    showToast('Kategori silinemedi: ' + friendlyFirestoreError(err), true);
  }
}

document.getElementById('manageCategoriesBtn').addEventListener('click', openCategoryModal);
document.getElementById('categoryModalCloseBtn').addEventListener('click', closeCategoryModal);
document.getElementById('categoryModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'categoryModalOverlay') closeCategoryModal();
});
document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
document.getElementById('newCategoryName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCategory();
});
document.getElementById('categoryList').addEventListener('click', (e) => {
  const row = e.target.closest('[data-category-index]');
  if (!row) return;
  const index = Number(row.dataset.categoryIndex);
  if (!Number.isInteger(index)) return;

  if (e.target.closest('[data-category-up]')) return void moveCategory(index, -1);
  if (e.target.closest('[data-category-down]')) return void moveCategory(index, 1);
  if (e.target.closest('[data-category-save]')) {
    const input = row.querySelector('[data-category-name]');
    return void renameCategory(index, input?.value);
  }
  if (e.target.closest('[data-category-delete]')) return void deleteCategory(index);
});
document.getElementById('categoryList').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('[data-category-name]')) return;
  const row = e.target.closest('[data-category-index]');
  if (!row) return;
  e.preventDefault();
  renameCategory(Number(row.dataset.categoryIndex), e.target.value);
});

// ---------------------------------------------------------------------
// Ekle/Düzenle modal
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

  const typeOptions = [...currentCategories];
  cfg.typeOptions.forEach(t => {
    if (!typeOptions.some(x => x.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR'))) typeOptions.push(t);
  });
  document.getElementById('typeOptions').innerHTML = typeOptions
    .map(t => `<option value="${escapeHtml(t)}">`)
    .join('');

  document.getElementById('appCheckboxRow').innerHTML = cfg.appOptions
    .map(a => `<label><input type="checkbox" name="app" value="${escapeHtml(a)}"> ${escapeHtml(a)}</label>`)
    .join('');
}

function openModal(id = null) {
  editingId = id;
  applyTabFieldVisibility();

  const overlay = document.getElementById('itemModalOverlay');
  const form = document.getElementById('itemForm');
  form.reset();
  document.querySelectorAll('#itemForm input[type=checkbox][name]').forEach(cb => { cb.checked = false; });

  const cfg = TAB_CONFIG[activeTab];
  const dateField = cfg.hasInstallGuide ? 'fDateAdded' : 'fDateAdded2';

  if (id) {
    const p = currentItems.find(x => x.id === id);
    if (!p) {
      showToast('Kayıt bulunamadı. Listeyi yenile.', true);
      return;
    }

    document.getElementById('modalTitle').textContent = 'Kaydı Düzenle';
    document.getElementById('fName').value = p.name || '';
    document.getElementById('fDesc').value = p.desc || '';
    document.getElementById('fType').value = p.type || '';
    document.getElementById('fDebrid').value = p.debrid || 'free';
    document.getElementById('fInstallGuide').value = p.installGuide || 'nuvio';
    document.getElementById(dateField).value = p.dateAdded || todayISO();
    document.getElementById('fStatus').value = ['ok', 'warn', 'dead'].includes(p.status) ? p.status : '';
    document.getElementById('fAgeRestricted').checked = Boolean(p.ageRestricted);
    document.getElementById('fCode').value = p.code || '';
    document.getElementById('fSourceUrl').value = p.sourceUrl || '';

    (Array.isArray(p.app) ? p.app : []).forEach(a => {
      const cb = [...form.querySelectorAll('input[name=app]')].find(x => x.value === a);
      if (cb) cb.checked = true;
    });
    (Array.isArray(p.platform) ? p.platform : []).forEach(pl => {
      const cb = [...form.querySelectorAll('input[name=platform]')].find(x => x.value === pl);
      if (cb) cb.checked = true;
    });

    document.getElementById('deleteItemBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('modalTitle').textContent = 'Yeni ' + (activeTab === 'plugins' ? 'Eklenti' : 'Uygulama');
    document.getElementById(dateField).value = todayISO();
    document.getElementById('fStatus').value = cfg.hasInstallGuide ? '' : 'ok';
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

function buildPayload() {
  const form = document.getElementById('itemForm');
  const cfg = TAB_CONFIG[activeTab];
  const dateField = cfg.hasInstallGuide ? 'fDateAdded' : 'fDateAdded2';

  const payload = {
    name: document.getElementById('fName').value.trim(),
    desc: document.getElementById('fDesc').value.trim(),
    type: document.getElementById('fType').value.trim(),
    dateAdded: document.getElementById(dateField).value || todayISO(),
    app: [...form.querySelectorAll('input[name=app]:checked')].map(cb => cb.value),
    platform: [...form.querySelectorAll('input[name=platform]:checked')].map(cb => cb.value),
    status: document.getElementById('fStatus').value
  };

  if (cfg.hasInstallGuide) {
    payload.debrid = document.getElementById('fDebrid').value;
    payload.installGuide = document.getElementById('fInstallGuide').value;
    payload.ageRestricted = document.getElementById('fAgeRestricted').checked;
  }

  if (cfg.hasCode) {
    payload.code = document.getElementById('fCode').value.trim();
    payload.sourceUrl = document.getElementById('fSourceUrl').value.trim();
  }

  return payload;
}

function applyPayload(existing, payload, cfg) {
  const next = { ...existing, ...payload };

  // Worker'daki eski davranışı koru: boş opsiyonel alanları JSON'da tutma.
  if (!payload.status) delete next.status;
  if (cfg.hasInstallGuide) {
    if (!payload.ageRestricted) delete next.ageRestricted;
  }
  if (cfg.hasCode) {
    if (!payload.code) delete next.code;
    if (!payload.sourceUrl) delete next.sourceUrl;
  }

  return next;
}

document.getElementById('itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!auth.currentUser) {
    showToast('Oturum kapalı. Tekrar giriş yap.', true);
    return;
  }

  const payload = buildPayload();
  if (!payload.name || !payload.desc) {
    showToast('Başlık ve URL/Açıklama gerekli.', true);
    return;
  }

  const cfg = TAB_CONFIG[activeTab];
  const tabAtStart = activeTab;
  const editIdAtStart = editingId;
  const saveBtn = document.getElementById('saveItemBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Kaydediliyor…';

  try {
    await mutateCatalog(tabAtStart, (items, categories) => {
      if (payload.type && !categories.some(c => c.toLocaleLowerCase('tr-TR') === payload.type.toLocaleLowerCase('tr-TR'))) {
        categories.push(payload.type);
      }

      if (editIdAtStart) {
        const idx = items.findIndex(x => x.id === editIdAtStart);
        if (idx === -1) throw new Error('Düzenlenecek kayıt bulunamadı. Listeyi yenile.');
        items[idx] = applyPayload(items[idx], payload, cfg);
        items[idx].id = editIdAtStart;
        return items[idx];
      }

      const entry = applyPayload({ id: crypto.randomUUID() }, payload, cfg);
      items.push(entry);
      return entry;
    });

    showToast(editIdAtStart ? 'Güncellendi.' : 'Eklendi.');
    closeModal();
    await loadItems();
  } catch (err) {
    showToast('Kaydedilemedi: ' + friendlyFirestoreError(err), true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Kaydet';
  }
});

document.getElementById('deleteItemBtn').addEventListener('click', async () => {
  if (!editingId || !auth.currentUser) return;
  if (!confirm('Bu kaydı silmek istediğine emin misin?')) return;

  const tabAtStart = activeTab;
  const editIdAtStart = editingId;
  const btn = document.getElementById('deleteItemBtn');
  btn.disabled = true;
  btn.textContent = 'Siliniyor…';

  try {
    await mutateCatalog(tabAtStart, (items) => {
      const idx = items.findIndex(x => x.id === editIdAtStart);
      if (idx === -1) throw new Error('Silinecek kayıt bulunamadı. Listeyi yenile.');
      items.splice(idx, 1);
    });

    showToast('Silindi.');
    closeModal();
    await loadItems();
  } catch (err) {
    showToast('Silinemedi: ' + friendlyFirestoreError(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sil';
  }
});
