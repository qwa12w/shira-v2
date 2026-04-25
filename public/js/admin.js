// ==========================================
// شراع | Shira Platform - Admin Module v2.2
// ✅ التحديث: الزبائن، العدادات، قيد المراجعة، المدراء، تفاصيل المستخدم
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
    canExportData: true,
    canManagePending: true
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
          Admin.startCountersUpdate(); // ✅ بدء تحديث العدادات
          return;
        }
      }
      document.getElementById('login-overlay').classList.remove('hidden');
      document.getElementById('admin-panel').classList.add('hidden');
    } catch (err) {
      console.error('Session error:', err);
    }
  },

  // ✅ بدء تحديث العدادات كل 30 ثانية
  startCountersUpdate: () => {
    Admin.updateSidebarCounts();
    setInterval(() => Admin.updateSidebarCounts(), 30000);
  },

  // ✅ تحديث عدادات القائمة الجانبية
  updateSidebarCounts: async () => {
    try {
      Admin.ensureDb();
      const [all, customers, drivers, delivery, stores, pending] = await Promise.all([
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'admin'),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'زبون'),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['سائق تكسي', 'سائق توك توك']),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'دلفري'),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'صاحب متجر'),
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'قيد المراجعة').in('role', ['سائق تكسي', 'سائق توك توك', 'دلفري', 'صاحب متجر'])
      ]);

      const counts = {
        users: all.count || 0,
        customers: customers.count || 0,
        drivers: drivers.count || 0,
        delivery: delivery.count || 0,
        stores: stores.count || 0,
        pending: pending.count || 0
      };

      Object.entries(counts).forEach(([id, count]) => {
        const badge = document.querySelector(`.badge-count[data-section="${id}"]`);
        if (badge) badge.innerText = count;
      });
    } catch (err) {
      console.warn('Counters update error:', err);
    }
  },

  renderSidebar: () => {
    const nav = document.getElementById('admin-nav');
    if (!nav) return;
    
    let html = `
      <div class="nav-link active" onclick="Admin.render('dashboard')">📊 نظرة عامة</div>
      <div class="nav-link" onclick="Admin.render('map-live')">🗺️ الخريطة الحية</div>
      <div class="nav-link" onclick="Admin.render('users')">👥 جميع المستخدمين <span class="badge-count" data-section="users">0</span></div>
      <div class="nav-link" onclick="Admin.render('customers')">👤 الزبائن <span class="badge-count" data-section="customers">0</span></div>
      <div class="nav-link" onclick="Admin.render('drivers')">🚗 السائقين <span class="badge-count" data-section="drivers">0</span></div>
      <div class="nav-link" onclick="Admin.render('delivery')">🏍️ الدلفري <span class="badge-count" data-section="delivery">0</span></div>
      <div class="nav-link" onclick="Admin.render('stores')">🏪 المتاجر <span class="badge-count" data-section="stores">0</span></div>
      <div class="nav-link" onclick="Admin.render('pending')">⏳ قيد المراجعة <span class="badge-count" data-section="pending">0</span></div>
      <div class="nav-link" onclick="Admin.render('trips')">📦 الرحلات</div>
      <div class="nav-link" onclick="Admin.render('revenue')">💰 الإيرادات</div>
      <div class="nav-link" onclick="Admin.render('notifications')">🔔 الإشعارات</div>
    `;
    
    if (Admin.permissions.canManageManagers) {
      html += `<div class="nav-link" onclick="Admin.render('managers')">👔 المدراء</div>`;
    }
    
    html += `<div class="nav-link logout" onclick="Admin.logout()">🚪 خروج</div>`;
    nav.innerHTML = html;
    Admin.updateSidebarCounts();
  },

  login: async () => {
    Admin.ensureDb();
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
      'users': '👥 إدارة المستخدمين', 'customers': '👤 إدارة الزبائن',
      'drivers': '🚗 إدارة السائقين', 'delivery': '🏍️ إدارة الدلفري',
      'stores': '🏪 إدارة المتاجر', 'pending': '⏳ قيد المراجعة',
      'trips': '📦 سجل الرحلات', 'revenue': '💰 الإيرادات والاشتراكات',
      'notifications': '🔔 مركز الإشعارات', 'managers': '👔 إدارة المدراء'
    };
    if (title) title.innerText = titles[page] || 'لوحة الإدارة';
    content.innerHTML = '<div class="text-center" style="padding:50px">⏳ جاري التحميل...</div>';
    
    switch(page) {
      case 'dashboard': await Admin.loadDashboard(content); break;
      case 'map-live': await Admin.loadLiveMap(content); break;
      case 'users': await Admin.loadUsers(content, 'all'); break;
      case 'customers': await Admin.loadUsers(content, 'customer'); break;
      case 'drivers': await Admin.loadUsers(content, 'driver'); break;
      case 'delivery': await Admin.loadUsers(content, 'delivery'); break;
      case 'stores': await Admin.loadStores(content); break;
      case 'pending': await Admin.loadPending(content); break;
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
        Admin.db.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'admin'),
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

  // ✅ تحميل المستخدمين مع البحث والتفاصيل
  loadUsers: async (container, type) => {
    try {
      Admin.ensureDb();
      let query = Admin.db.from('profiles').select('*').neq('role', 'admin');
      
      if (type === 'customer') query = query.eq('role', 'زبون');
      else if (type === 'driver') query = query.in('role', ['سائق تكسي', 'سائق توك توك']);
      else if (type === 'delivery') query = query.eq('role', 'دلفري');
      
      const { data } = await query.order('created_at', { ascending: false });
      
      let html = `
        <div style="margin-bottom:15px; display:flex; gap:10px;">
          <input type="text" id="user-search" placeholder="🔍 بحث بالاسم أو الهاتف..." 
                 style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px;"
                 onkeyup="Admin.searchUsersTable()">
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody id="users-table-body">
      `;
      
      (data || []).forEach(u => {
        html += `<tr data-name="${(u.name||'').toLowerCase()}" data-phone="${u.phone||''}">
          <td>${u.name||'-'}</td><td>${u.phone||'-'}</td>
          <td><span style="background:#e0f2fe; padding:2px 8px; border-radius:10px; font-size:11px;">${u.role||'-'}</span></td>
          <td>${u.status||'-'}</td>
          <td>
            <button class="btn-sm" onclick="Admin.viewUserDetails('${u.id}')" style="background:#3b82f6; color:white; padding:4px 8px; border:none; border-radius:4px; cursor:pointer;">👁️</button>
          </td>
        </tr>`;
      });
      
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { console.error('Users error:', err); container.innerHTML = '<div class="text-center mt-2">❌ فشل التحميل</div>'; }
  },

  // ✅ بحث في جدول المستخدمين
  searchUsersTable: () => {
    const search = document.getElementById('user-search')?.value.toLowerCase() || '';
    document.querySelectorAll('#users-table-body tr').forEach(row => {
      const name = row.dataset.name || '';
      const phone = row.dataset.phone || '';
      row.style.display = (name.includes(search) || phone.includes(search)) ? '' : 'none';
    });
  },

  // ✅ عرض تفاصيل المستخدم في نافذة منبثقة
  viewUserDetails: async (userId) => {
    try {
      Admin.ensureDb();
      const {  user } = await Admin.db.from('profiles').select('*').eq('id', userId).single();
      if (!user) return;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:2000;';
      modal.innerHTML = `
        <div style="background:white; padding:25px; border-radius:16px; width:90%; max-width:700px; max-height:90vh; overflow-y:auto; position:relative;">
          <button onclick="this.closest('.modal-overlay').remove()" style="position:absolute; top:15px; left:15px; background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
          
          <h3 style="margin-bottom:20px; text-align:center;">📋 ملف: ${user.name}</h3>
          
          <div style="display:flex; gap:20px; margin-bottom:25px; align-items:center;">
            <img src="${user.profile_image || 'https://ui-avatars.com/api/?name='+encodeURIComponent(user.name)}" 
                 style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--p);">
            <div>
              <p><strong>📱 الهاتف:</strong> ${user.phone}</p>
              <p><strong>🎭 الدور:</strong> ${user.role}</p>
              <p><strong>📊 الحالة:</strong> ${user.status}</p>
              <p><strong>🎂 العمر:</strong> ${user.age || '-'}</p>
            </div>
          </div>
          
          ${user.role === 'سائق تكسي' || user.role === 'سائق توك توك' ? `
            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px;">
              <h4 style="margin-bottom:10px;">🚗 بيانات المركبة</h4>
              <p><strong>اللوحة:</strong> ${user.plate_number || '-'}</p>
              <p><strong>النوع:</strong> ${user.vehicle_type || '-'}</p>
              <p><strong>اللون:</strong> ${user.vehicle_color || '-'}</p>
            </div>` : ''}
          
          ${user.role === 'صاحب متجر' ? `
            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px;">
              <h4 style="margin-bottom:10px;">🏪 بيانات المتجر</h4>
              <p><strong>النوع:</strong> ${user.store_type || '-'}</p>
              <p><strong>الحالة:</strong> ${user.store_status || '-'}</p>
            </div>` : ''}
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px;">
            <button class="btn-primary" onclick="Admin.editUserModal('${user.id}')" style="padding:10px; background:#3b82f6; color:white; border:none; border-radius:8px; cursor:pointer;">✏️ تعديل البيانات</button>
            <button class="btn-primary" onclick="Admin.toggleUserStatus('${user.id}', '${user.status}')" style="padding:10px; background:${user.status==='نشط'?'#ef4444':'#10b981'}; color:white; border:none; border-radius:8px; cursor:pointer;">${user.status==='نشط'?'🚫 حظر':'✅ تفعيل'}</button>
            <button class="btn-outline" onclick="Admin.contactUser('${user.phone}')" style="padding:10px; background:#22c55e; color:white; border:none; border-radius:8px; cursor:pointer;">💬 مراسلة واتساب</button>
            <button class="btn-outline" onclick="Admin.previewAsUser('${user.id}')" style="padding:10px; background:#f59e0b; color:white; border:none; border-radius:8px; cursor:pointer;">👁️ معاينة كمستخدم</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (err) {
      console.error('Modal error:', err);
      alert('❌ فشل تحميل التفاصيل');
    }
  },

  // ✅ تعديل بيانات المستخدم
  editUserModal: async (userId) => {
    const {  user } = await Admin.db.from('profiles').select('*').eq('id', userId).single();
    if (!user) return;
    
    const newName = prompt('الاسم الجديد:', user.name);
    if (newName === null) return;
    
    const newPhone = prompt('الهاتف الجديد:', user.phone);
    if (newPhone === null) return;
    
    await Admin.db.from('profiles').update({ name: newName, phone: newPhone }).eq('id', userId);
    alert('✅ تم تحديث البيانات');
    Admin.viewUserDetails(userId);
  },

  // ✅ تغيير حالة المستخدم
  toggleUserStatus: async (userId, currentStatus) => {
    const newStatus = currentStatus === 'نشط' ? 'محظور' : 'نشط';
    if (!confirm(`هل تريد ${newStatus === 'نشط' ? 'تفعيل' : 'حظر'} هذا المستخدم؟`)) return;
    
    await Admin.db.from('profiles').update({ status: newStatus }).eq('id', userId);
    alert(`✅ تم ${newStatus === 'نشط' ? 'تفعيل' : 'حظر'} المستخدم`);
    Admin.render('users');
  },

  // ✅ مراسلة عبر واتساب
  contactUser: (phone) => {
    const cleanPhone = phone.replace(/^0/, '').replace(/\s+/g, '');
    window.open(`https://wa.me/964${cleanPhone}`, '_blank');
  },

  // ✅ معاينة كمستخدم (يفتح التطبيق بواجهة هذا المستخدم)
  previewAsUser: (userId) => {
    const url = new URL(window.location.origin);
    url.pathname = '/';
    url.searchParams.set('preview_as', userId);
    window.open(url.toString(), '_blank');
  },

  loadStores: async (container) => {
    try {
      Admin.ensureDb();
      const { data } = await Admin.db.from('profiles').select('*').eq('role', 'صاحب متجر');
      let html = `<div class="table-container"><table><thead><tr><th>المتجر</th><th>المالك</th><th>النوع</th><th>إجراءات</th></tr></thead><tbody>`;
      (data || []).forEach(s => { 
        html += `<tr><td>${s.name||'-'}</td><td>${s.name||'-'}</td><td>${s.store_type||'-'}</td>
        <td><button class="btn-sm" onclick="Admin.viewUserDetails('${s.id}')" style="background:#3b82f6; color:white; padding:4px 8px; border:none; border-radius:4px; cursor:pointer;">👁️</button></td></tr>`; 
      });
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

  // ✅ قسم "قيد المراجعة" الجديد
  loadPending: async (container) => {
    try {
      Admin.ensureDb();
      const { data } = await Admin.db.from('profiles')
        .select('*')
        .eq('status', 'قيد المراجعة')
        .in('role', ['سائق تكسي', 'سائق توك توك', 'دلفري', 'صاحب متجر'])
        .order('created_at', { ascending: false });
      
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="text-center mt-2" style="color:var(--green);">✅ لا توجد طلبات مراجعة جديدة</div>';
        return;
      }
      
      let html = `<div class="space-y-4">`;
      data.forEach(user => {
        html += `
          <div style="background:white; padding:15px; border-radius:12px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <img src="${user.profile_image || 'https://ui-avatars.com/api/?name='+encodeURIComponent(user.name)}" 
                   style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
              <div>
                <h4 style="margin:0; font-weight:600;">${user.name}</h4>
                <p style="margin:3px 0 0; color:var(--g); font-size:13px;">${user.role} • ${user.phone}</p>
                <p style="margin:3px 0 0; color:var(--g); font-size:11px;">${new Date(user.created_at).toLocaleDateString('ar-IQ')}</p>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button onclick="Admin.viewUserDetails('${user.id}')" style="padding:6px 12px; background:#64748b; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">👁️ تفاصيل</button>
              <button onclick="Admin.approveUser('${user.id}')" style="padding:6px 12px; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">✅ قبول</button>
              <button onclick="Admin.rejectUser('${user.id}')" style="padding:6px 12px; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🚫 رفض</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
      container.innerHTML = html;
    } catch (err) {
      console.error('Pending error:', err);
      container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>';
    }
  },

  // ✅ قبول مستخدم من قيد المراجعة
  approveUser: async (userId) => {
    const months = prompt("حدد مدة الاشتراك بالأشهر:\n1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12", "1");
    if (!months || !/^\d+$/.test(months) || parseInt(months) < 1 || parseInt(months) > 12) {
      return alert('⚠️ أدخل رقماً صحيحاً بين 1 و 12');
    }
    
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + parseInt(months));
    
    await Admin.db.from('profiles').update({
      status: 'نشط',
      subscription_end: endDate.toISOString()
    }).eq('id', userId);
    
    alert(`✅ تم قبول الحساب وتفعيله لـ ${months} أشهر.\nسيبدأ العمل فوراً.`);
    Admin.render('pending');
    Admin.updateSidebarCounts();
  },

  // ✅ رفض مستخدم من قيد المراجعة
  rejectUser: async (userId) => {
    const reason = prompt("⚠️ اكتب سبب الرفض (سيتم إبلاغ المستخدم):");
    if (!reason || reason.trim() === '') return alert('⚠️ يجب كتابة سبب الرفض');
    
    await Admin.db.from('profiles').update({
      status: 'مرفوض',
      rejection_reason: reason.trim()
    }).eq('id', userId);
    
    alert(`🚫 تم رفض الحساب.\nالسبب: ${reason}\nتم إبلاغ المستخدم.`);
    Admin.render('pending');
    Admin.updateSidebarCounts();
  },

  // ✅ قسم المدراء (للمالك فقط)
  loadManagers: async (container) => {
    if (!Admin.permissions.canManageManagers) {
      return container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">⛔ صلاحية المالك فقط</div>';
    }
    
    let html = `
      <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px;">
        <h4 style="margin-bottom:15px;">➕ إضافة مدير جديد</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
          <input type="text" id="mgr-name" placeholder="الاسم الكامل" style="padding:8px; border:1px solid #ddd; border-radius:6px;">
          <input type="tel" id="mgr-phone" placeholder="رقم الهاتف" style="padding:8px; border:1px solid #ddd; border-radius:6px;">
          <input type="password" id="mgr-pass" placeholder="كلمة المرور" style="padding:8px; border:1px solid #ddd; border-radius:6px;">
          <input type="time" id="mgr-start" placeholder="وقت البدء" style="padding:8px; border:1px solid #ddd; border-radius:6px;">
          <input type="time" id="mgr-end" placeholder="وقت الانتهاء" style="padding:8px; border:1px solid #ddd; border-radius:6px;">
        </div>
        <div style="margin:10px 0;">
          <strong style="display:block; margin-bottom:8px;">الصلاحيات:</strong>
          <div style="display:flex; gap:15px; flex-wrap:wrap; font-size:13px;">
            <label><input type="checkbox" id="perm-users" checked> 👥 المستخدمين</label>
            <label><input type="checkbox" id="perm-drivers" checked> 🚗 السائقين</label>
            <label><input type="checkbox" id="perm-stores"> 🏪 المتاجر</label>
            <label><input type="checkbox" id="perm-revenue"> 💰 الإيرادات</label>
            <label><input type="checkbox" id="perm-trips"> 📦 الرحلات</label>
            <label><input type="checkbox" id="perm-pending"> ⏳ المراجعات</label>
          </div>
        </div>
        <button onclick="Admin.addNewManager()" style="padding:10px 20px; background:#3b82f6; color:white; border:none; border-radius:8px; cursor:pointer;">💾 حفظ المدير</button>
      </div>
      
      <h4 style="margin-bottom:15px;">👔 قائمة المدراء الحاليين</h4>
      <div id="managers-list" class="space-y-2">
        <p style="color:var(--g);">جاري التحميل...</p>
      </div>
    `;
    
    container.innerHTML = html;
    Admin.loadManagersList();
  },

  // ✅ تحميل قائمة المدراء
  loadManagersList: async () => {
    const {  data } = await Admin.db.from('profiles')
      .select('id, name, phone, email, role, admin_permissions, work_hours')
      .eq('role', 'admin')
      .neq('email', Admin.ownerEmail);
    
    const list = document.getElementById('managers-list');
    if (!list) return;
    
    if (data && data.length > 0) {
      list.innerHTML = data.map(m => `
        <div style="background:white; padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <strong>${m.name}</strong><br>
            <small style="color:var(--g);">${m.phone} • ${m.email}</small><br>
            ${m.work_hours ? `<small style="color:var(--p);">⏰ ${m.work_hours.start} - ${m.work_hours.end}</small>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="Admin.editManager('${m.id}')" style="padding:4px 10px; background:#64748b; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">✏️</button>
            <button onclick="Admin.deleteManager('${m.id}')" style="padding:4px 10px; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px;">🗑️</button>
          </div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<p style="color:var(--g);">لا يوجد مدراء إضافيين</p>';
    }
  },

  // ✅ إضافة مدير جديد
  addNewManager: async () => {
    const name = document.getElementById('mgr-name')?.value.trim();
    const phone = document.getElementById('mgr-phone')?.value.trim();
    const pass = document.getElementById('mgr-pass')?.value;
    const start = document.getElementById('mgr-start')?.value;
    const end = document.getElementById('mgr-end')?.value;
    
    if (!name || !phone || !pass) return alert('⚠️ أكمل الاسم والهاتف وكلمة المرور');
    
    const permissions = {
      users: document.getElementById('perm-users')?.checked,
      drivers: document.getElementById('perm-drivers')?.checked,
      stores: document.getElementById('perm-stores')?.checked,
      revenue: document.getElementById('perm-revenue')?.checked,
      trips: document.getElementById('perm-trips')?.checked,
      pending: document.getElementById('perm-pending')?.checked
    };
    
    const workHours = start && end ? { start, end } : null;
    
    // إنشاء الحساب في auth
    const {  authData, error: authErr } = await Admin.db.auth.signUp({
      email: phone + '@shira.app',
      password: pass
    });
    
    if (authErr) return alert('❌ فشل إنشاء الحساب: ' + authErr.message);
    
    // إنشاء البروفايل
    await Admin.db.from('profiles').insert({
      id: authData.user.id,
      name,
      phone,
      email: phone + '@shira.app',
      role: 'admin',
      status: 'نشط',
      admin_permissions: permissions,
      work_hours: workHours
    });
    
    alert('✅ تم إضافة المدير بنجاح');
    Admin.loadManagers(document.getElementById('content-area'));
  },

  // ✅ تعديل مدير
  editManager: async (managerId) => {
    const {  mgr } = await Admin.db.from('profiles').select('*').eq('id', managerId).single();
    if (!mgr) return;
    
    const newName = prompt('الاسم الجديد:', mgr.name);
    if (newName === null) return;
    
    await Admin.db.from('profiles').update({ name: newName }).eq('id', managerId);
    alert('✅ تم تحديث بيانات المدير');
    Admin.loadManagersList();
  },

  // ✅ حذف مدير
  deleteManager: async (managerId) => {
    if (!confirm('⚠️ حذف هذا المدير نهائياً؟')) return;
    
    await Admin.db.auth.admin.deleteUser(managerId);
    await Admin.db.from('profiles').delete().eq('id', managerId);
    
    alert('🗑️ تم حذف المدير');
    Admin.loadManagersList();
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
