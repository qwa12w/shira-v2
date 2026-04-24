// ==========================================
// شراع | Shira Platform - Admin Module v2.1 (Stable)
// ✅ الإصلاح: معالجة تهيئة قاعدة البيانات قبل أي عملية
// ==========================================

const Admin = {
  db: null,
  ownerEmail: "aliiraqi22507019@gmail.com",
  currentAdmin: null,
  map: null,
  userMarkers: {},
  liveTracking: null,
  
  permissions: {
    canManageUsers: true,
    canManageDrivers: true,
    canManageStores: true,
    canViewRevenue: true,
    canManageManagers: false,
    canExportData: true
  },

  // ✅ دالة ضمان التهيئة (تُستدعى قبل أي عملية)
  ensureDb: () => {
    if (!Admin.db) {
      Admin.db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
  },

  init: async () => {
    Admin.ensureDb();
    await Admin.checkSession();
  },

  checkSession: async () => {
    try {
      Admin.ensureDb();
      const sessionRes = await Admin.db.auth.getSession();
      const session = sessionRes.data ? sessionRes.data.session : null;
      
      if (session) {
        const profRes = await Admin.db.from('profiles').select('*').eq('id', session.user.id).single();
        const profile = profRes.data;
        
        if (profile && (profile.email === Admin.ownerEmail || profile.role === 'admin')) {
          Admin.currentAdmin = profile;
          Admin.permissions.canManageManagers = (profile.email === Admin.ownerEmail);
          document.getElementById('login-overlay').classList.add('hidden');
          document.getElementById('admin-panel').classList.remove('hidden');
          Admin.renderSidebar();
          Admin.render('dashboard');
          return;
        }
      }
      document.getElementById('login-overlay').classList.remove('hidden');
      document.getElementById('admin-panel').classList.add('hidden');
    } catch (err) {
      console.error('Session error:', err);
    }
  },

  renderSidebar: () => {
    const nav = document.getElementById('admin-nav');
    if (!nav) return;
    let html = `
      <div class="nav-link active" onclick="Admin.render('dashboard')">📊 نظرة عامة</div>
      <div class="nav-link" onclick="Admin.render('map-live')">🗺️ الخريطة الحية</div>
      <div class="nav-link" onclick="Admin.render('users')">👥 جميع المستخدمين</div>
      <div class="nav-link" onclick="Admin.render('drivers')">🚗 السائقين</div>
      <div class="nav-link" onclick="Admin.render('delivery')">🏍️ الدلفري</div>
      <div class="nav-link" onclick="Admin.render('stores')">🏪 المتاجر</div>
      <div class="nav-link" onclick="Admin.render('trips')">📦 الرحلات</div>
      <div class="nav-link" onclick="Admin.render('revenue')">💰 الإيرادات</div>
      <div class="nav-link" onclick="Admin.render('notifications')">🔔 الإشعارات</div>
    `;
    if (Admin.permissions.canManageManagers) {
      html += `<div class="nav-link" onclick="Admin.render('managers')">👔 المدراء</div>`;
    }
    html += `<div class="nav-link logout" onclick="Admin.logout()">🚪 خروج</div>`;
    nav.innerHTML = html;
  },

  login: async () => {
    Admin.ensureDb(); // ✅ ضمان التهيئة قبل الدخول
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    if (!email || !pass) return alert('⚠️ أكمل البيانات');
    
    const { error } = await Admin.db.auth.signInWithPassword({ email, password: pass });
    if (error) return alert('❌ ' + error.message);
    Admin.checkSession();
  },

  logout: async () => {
    if (Admin.liveTracking) clearInterval(Admin.liveTracking);
    await Admin.db.auth.signOut();
    location.reload();
  },

  render: async (page) => {
    Admin.ensureDb();
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('.nav-link')).find(el => el.getAttribute('onclick')?.includes(page));
    if (activeLink) activeLink.classList.add('active');
    
    const content = document.getElementById('content-area');
    const title = document.getElementById('page-title');
    const titles = {
      'dashboard': '📊 نظرة عامة', 'map-live': '🗺️ الخريطة الحية للمستخدمين',
      'users': '👥 إدارة المستخدمين', 'drivers': '🚗 إدارة السائقين',
      'delivery': '🏍️ إدارة الدلفري', 'stores': '🏪 إدارة المتاجر',
      'trips': '📦 سجل الرحلات', 'revenue': '💰 الإيرادات والاشتراكات',
      'notifications': '🔔 مركز الإشعارات', 'managers': '👔 إدارة المدراء'
    };
    if (title) title.innerText = titles[page] || 'لوحة الإدارة';
    content.innerHTML = '<div class="text-center" style="padding:50px">⏳ جاري التحميل...</div>';
    
    switch(page) {
      case 'dashboard': await Admin.loadDashboard(content); break;
      case 'map-live': await Admin.loadLiveMap(content); break;
      case 'users': await Admin.loadUsers(content, 'all'); break;
      case 'drivers': await Admin.loadUsers(content, 'driver'); break;
      case 'delivery': await Admin.loadUsers(content, 'delivery'); break;
      case 'stores': await Admin.loadStores(content); break;
      case 'trips': await Admin.loadTrips(content); break;
      case 'revenue': await Admin.loadRevenue(content); break;
      case 'notifications': await Admin.loadNotifications(content); break;
      case 'managers': await Admin.loadManagers(content); break;
      default: content.innerHTML = '<div class="text-center mt-2">📄 صفحة غير موجودة</div>';
    }
  },

  loadDashboard: async (container) => {
    try {
      Admin.ensureDb();
      const [users, active, pending, trips, stores] = await Promise.all([
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'نشط'),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'قيد المراجعة'),
        Admin.db.from('trips').select('id', { count: 'exact', head: true }),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'صاحب متجر')
      ]);
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><h3>👥 إجمالي المستخدمين</h3><div class="value">${users.count || 0}</div></div>
          <div class="stat-card"><h3>✅ المستخدمون النشطون</h3><div class="value" style="color:var(--green)">${active.count || 0}</div></div>
          <div class="stat-card"><h3>⏳ قيد المراجعة</h3><div class="value" style="color:var(--p)">${pending.count || 0}</div></div>
          <div class="stat-card"><h3>🚕 إجمالي الرحلات</h3><div class="value">${trips.count || 0}</div></div>
          <div class="stat-card"><h3>🏪 المتاجر</h3><div class="value">${stores.count || 0}</div></div>
        </div>
        <div class="table-container" style="margin-top:20px">
          <h4 style="margin-bottom:15px">🗺️ معاينة الخريطة الحية</h4>
          <div id="dashboard-map" style="height:300px; border-radius:12px; background:#f1f5f9"></div>
        </div>`;
      setTimeout(() => Admin.initMiniMap(), 500);
    } catch (err) { console.error('Dashboard error:', err); container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>'; }
  },

  initMiniMap: () => {
    if (Admin.map) Admin.map.remove();
    Admin.map = L.map('dashboard-map').setView(CONFIG.MAP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(Admin.map);
  },

  loadLiveMap: async (container) => {
    Admin.ensureDb();
    container.innerHTML = `<div id="full-map" style="height:calc(100vh - 200px); border-radius:12px;"></div>`;
    await Admin.initFullMap();
    await Admin.fetchLiveUsers();
    if (Admin.liveTracking) clearInterval(Admin.liveTracking);
    Admin.liveTracking = setInterval(() => Admin.fetchLiveUsers(), 30000);
  },

  initFullMap: () => {
    if (Admin.map) Admin.map.remove();
    Admin.map = L.map('full-map').setView(CONFIG.MAP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(Admin.map);
    Admin.userMarkers = {};
  },

  fetchLiveUsers: async () => {
    try {
      Admin.ensureDb();
      const { data } = await Admin.db.from('profiles').select('id, name, phone, role, status, latitude, longitude').eq('status', 'نشط').not('latitude', 'is', null);
      const icons = { 'زبون': '👤', 'سائق تكسي': '🚗', 'سائق توك توك': '🛺', 'دلفري': '🏍️', 'صاحب متجر': '🏪' };
      data?.forEach(user => {
        if (Admin.userMarkers[user.id]) {
          Admin.userMarkers[user.id].setLatLng([user.latitude, user.longitude]);
        } else {
          const marker = L.marker([user.latitude, user.longitude]).addTo(Admin.map).bindPopup(`<b>${user.name}</b><br>${user.role}`);
          Admin.userMarkers[user.id] = marker;
        }
      });
    } catch (err) { console.error('Live map error:', err); }
  },

  loadUsers: async (container, type) => {
    try {
      Admin.ensureDb();
      let query = Admin.db.from('profiles').select('*').neq('role', 'admin');
      if (type === 'driver') query = query.in('role', ['سائق تكسي', 'سائق توك توك']);
      else if (type === 'delivery') query = query.eq('role', 'دلفري');
      const { data } = await query.order('created_at', { ascending: false });
      let html = `<div class="table-container"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الحالة</th></tr></thead><tbody>`;
      (data || []).forEach(u => {
        html += `<tr><td>${u.name||'-'}</td><td>${u.phone||'-'}</td><td>${u.role||'-'}</td><td>${u.status||'-'}</td></tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { console.error('Users error:', err); container.innerHTML = '<div class="text-center mt-2">❌ فشل التحميل</div>'; }
  },

  loadStores: async (container) => {
    try {
      Admin.ensureDb();
      const { data } = await Admin.db.from('profiles').select('*').eq('role', 'صاحب متجر');
      let html = `<div class="table-container"><table><thead><tr><th>المتجر</th><th>المالك</th><th>النوع</th></tr></thead><tbody>`;
      (data || []).forEach(s => { html += `<tr><td>${s.name||'-'}</td><td>${s.name||'-'}</td><td>${s.store_type||'-'}</td></tr>`; });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { container.innerHTML = '<div class="text-center mt-2">❌ فشل التحميل</div>'; }
  },

  loadTrips: async (container) => {
    try {
      Admin.ensureDb();
      const { data } = await Admin.db.from('trips').select('*, customer:customer_id(name), driver:driver_id(name)').order('created_at', { ascending: false }).limit(50);
      let html = `<div class="table-container"><table><thead><tr><th>الزبون</th><th>السائق</th><th>السعر</th><th>الحالة</th></tr></thead><tbody>`;
      (data || []).forEach(t => { html += `<tr><td>${t.customer?.name||'-'}</td><td>${t.driver?.name||'-'}</td><td>${t.final_price||0}</td><td>${t.status||'-'}</td></tr>`; });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { container.innerHTML = '<div class="text-center mt-2">❌ فشل التحميل</div>'; }
  },

  loadRevenue: async (container) => {
    try {
      Admin.ensureDb();
      const fee = 30000;
      const [taxis, tuks, del] = await Promise.all([
        Admin.db.from('profiles').select('id', {count:'exact', head:true}).eq('role','سائق تكسي').eq('status','نشط'),
        Admin.db.from('profiles').select('id', {count:'exact', head:true}).eq('role','سائق توك توك').eq('status','نشط'),
        Admin.db.from('profiles').select('id', {count:'exact', head:true}).eq('role','دلفري').eq('status','نشط')
      ]);
      const total = ((taxis.count||0) + (tuks.count||0) + (del.count||0)) * fee;
      container.innerHTML = `<div class="stats-grid"><div class="stat-card"><h3>💰 الإيرادات الشهرية</h3><div class="value">${total.toLocaleString()} د.ع</div></div></div>`;
    } catch (err) { container.innerHTML = '<div class="text-center mt-2">❌ فشل التحميل</div>'; }
  },

  loadNotifications: async (container) => { container.innerHTML = '<div class="text-center mt-2">🔔 لا توجد إشعارات جديدة</div>'; },
  loadManagers: async (container) => {
    if (!Admin.permissions.canManageManagers) return container.innerHTML = '<div class="text-center mt-2">⛔ صلاحية المالك فقط</div>';
    container.innerHTML = '<div class="text-center mt-2">👔 إدارة المدراء (قيد التطوير)</div>';
  },

  init: () => {
    if (typeof L === 'undefined') {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
      const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; document.head.appendChild(script);
    }
  }
};

// ✅ التهيئة الآمنة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Admin.init);
} else {
  Admin.init();
}
