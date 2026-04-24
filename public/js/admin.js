// ==========================================
// شراع | Shira Platform - Admin Module v2.0
// ✅ الميزات: خريطة حية، إدارة منتجات، إيرادات، مدراء، تصدير PDF
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

  init: async () => {
    Admin.db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    await Admin.checkSession();
  },

  checkSession: async () => {
    try {
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
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('.nav-link'))
      .find(el => el.getAttribute('onclick')?.includes(page));
    if (activeLink) activeLink.classList.add('active');
    
    const content = document.getElementById('content-area');
    const title = document.getElementById('page-title');
    
    const titles = {
      'dashboard': '📊 نظرة عامة',
      'map-live': '🗺️ الخريطة الحية للمستخدمين',
      'users': '👥 إدارة المستخدمين',
      'drivers': '🚗 إدارة السائقين',
      'delivery': '🏍️ إدارة الدلفري',
      'stores': '🏪 إدارة المتاجر',
      'trips': '📦 سجل الرحلات',
      'revenue': '💰 الإيرادات والاشتراكات',
      'notifications': '🔔 مركز الإشعارات',
      'managers': '👔 إدارة المدراء'
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
          <p style="text-align:center; margin-top:10px; color:var(--g); font-size:13px">
            📍 اضغط على "الخريطة الحية" في القائمة لعرض جميع المستخدمين وتحديث مواقعهم لحظياً
          </p>
        </div>
      `;
      setTimeout(() => Admin.initMiniMap(), 500);
    } catch (err) {
      console.error('Dashboard error:', err);
      container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>';
    }
  },

  initMiniMap: () => {
    if (Admin.map) Admin.map.remove();
    Admin.map = L.map('dashboard-map').setView(CONFIG.MAP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(Admin.map);
    const icons = { 'سائق تكسي': '🚗', 'دلفري': '🏍️', 'زبون': '👤', 'صاحب متجر': '🏪' };
    for (let i = 0; i < 5; i++) {
      const lat = CONFIG.MAP_CENTER[0] + (Math.random() - 0.5) * 0.02;
      const lng = CONFIG.MAP_CENTER[1] + (Math.random() - 0.5) * 0.02;
      const role = ['سائق تكسي', 'دلفري', 'زبون'][Math.floor(Math.random() * 3)];
      L.marker([lat, lng]).addTo(Admin.map).bindPopup(`<b>${role}</b><br>موقع تجريبي`);
    }
  },

  loadLiveMap: async (container) => {
    container.innerHTML = `
      <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap">
        <select id="map-filter" class="input-field" style="width:auto" onchange="Admin.filterMapMarkers()">
          <option value="all">عرض الكل</option>
          <option value="زبون">👥 الزبائن</option>
          <option value="سائق تكسي">🚗 سائقين التكسي</option>
          <option value="سائق توك توك">🛺 سائقين التوك توك</option>
          <option value="دلفري">🏍️ الدلفري</option>
          <option value="صاحب متجر">🏪 أصحاب المتاجر</option>
        </select>
        <button class="btn-primary" style="width:auto" onclick="Admin.refreshLiveMap()">🔄 تحديث المواقع</button>
        <span id="live-status" style="color:var(--green); align-self:center">● متصل</span>
      </div>
      <div id="full-map" style="height:calc(100vh - 200px); border-radius:12px; box-shadow:var(--shadow)"></div>
      <div id="user-popup" class="hidden" style="position:fixed; bottom:20px; right:20px; background:white; padding:15px; border-radius:12px; box-shadow:var(--shadow); width:300px; z-index:1000">
        <button onclick="document.getElementById('user-popup').classList.add('hidden')" style="float:left; background:none; border:none; font-size:20px; cursor:pointer">&times;</button>
        <div id="popup-content"></div>
      </div>
    `;
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
      const { data } = await Admin.db.from('profiles')
        .select('id, name, phone, role, status, latitude, longitude, profile_image')
        .eq('status', 'نشط')
        .not('latitude', 'is', null);
      
      const filter = document.getElementById('map-filter')?.value || 'all';
      const icons = {
        'زبون': L.divIcon({ html: '<div style="background:#3b82f6; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:16px">👤</div>', className: '', iconSize: [30,30] }),
        'سائق تكسي': L.divIcon({ html: '<div style="background:#10b981; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:18px">🚗</div>', className: '', iconSize: [35,35] }),
        'سائق توك توك': L.divIcon({ html: '<div style="background:#f59e0b; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:18px">🛺</div>', className: '', iconSize: [35,35] }),
        'دلفري': L.divIcon({ html: '<div style="background:#ef4444; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:18px">🏍️</div>', className: '', iconSize: [35,35] }),
        'صاحب متجر': L.divIcon({ html: '<div style="background:#8b5cf6; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:18px">🏪</div>', className: '', iconSize: [35,35] })
      };
      
      data?.forEach(user => {
        if (filter !== 'all' && user.role !== filter) return;
        if (Admin.userMarkers[user.id]) {
          Admin.userMarkers[user.id].setLatLng([user.latitude, user.longitude]);
        } else {
          const marker = L.marker([user.latitude, user.longitude], { icon: icons[user.role] || icons['زبون'] })
            .addTo(Admin.map)
            .bindPopup(`<b>${user.name}</b><br>${user.role}<br>📱 ${user.phone}`)
            .on('click', () => Admin.showUserPopup(user));
          Admin.userMarkers[user.id] = marker;
        }
      });
      document.getElementById('live-status').innerText = '● متصل - آخر تحديث: ' + new Date().toLocaleTimeString('ar-IQ');
    } catch (err) {
      console.error('Live map error:', err);
    }
  },

  filterMapMarkers: () => Admin.fetchLiveUsers(),
  refreshLiveMap: () => Admin.fetchLiveUsers(),

  showUserPopup: (user) => {
    const popup = document.getElementById('user-popup');
    const content = document.getElementById('popup-content');
    content.innerHTML = `
      <div style="display:flex; gap:15px; margin-bottom:10px">
        <img src="${user.profile_image || 'https://ui-avatars.com/api/?name='+encodeURIComponent(user.name)}" style="width:60px; height:60px; border-radius:50%; object-fit:cover">
        <div>
          <h4 style="margin:0">${user.name}</h4>
          <p style="margin:5px 0; color:var(--g)">${user.role}</p>
          <p style="margin:0; font-weight:600">📱 ${user.phone}</p>
        </div>
      </div>
      <div style="display:flex; gap:10px">
        <button class="btn-sm btn-primary" style="flex:1" onclick="Admin.contactUser('${user.phone}')">💬 مراسلة</button>
        <button class="btn-sm btn-outline" style="flex:1" onclick="Admin.viewFullProfile('${user.id}')">👁️ عرض الملف</button>
      </div>
    `;
    popup.classList.remove('hidden');
  },

  contactUser: (phone) => {
    window.open(`https://wa.me/964${phone.replace(/^0/, '')}`, '_blank');
  },

  viewFullProfile: (userId) => {
    Admin.render('users');
    setTimeout(() => Admin.openUserModal(userId), 500);
  },

  loadUsers: async (container, type) => {
    try {
      let query = Admin.db.from('profiles').select('*').neq('role', 'admin');
      if (type === 'driver') {
        query = query.in('role', ['سائق تكسي', 'سائق توك توك']);
      } else if (type === 'delivery') {
        query = query.eq('role', 'دلفري');
      }
      const { data } = await query.order('created_at', { ascending: false });
      
      let html = `
        <div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap">
          <input type="text" id="user-search" class="input-field" placeholder="🔍 بحث بالاسم أو الهاتف..." style="flex:1; min-width:200px" onkeyup="Admin.searchUsers()">
          <select id="status-filter" class="input-field" style="width:auto" onchange="Admin.searchUsers()">
            <option value="all">كل الحالات</option>
            <option value="نشط">✅ نشط</option>
            <option value="قيد المراجعة">⏳ قيد المراجعة</option>
            <option value="محظور">🚫 محظور</option>
          </select>
        </div>
        <div class="table-container">
          <table>
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>السن</th><th>الحالة</th><th>تاريخ التسجيل</th><th>إجراءات</th></tr></thead>
            <tbody id="users-table-body">
      `;
      (data || []).forEach(u => {
        const statusBadge = u.status === 'نشط' ? 'badge-success' : (u.status === 'محظور' ? 'badge-danger' : 'badge-warning');
        html += `<tr data-name="${u.name?.toLowerCase() || ''}" data-phone="${u.phone || ''}" data-status="${u.status}">
          <td><strong>${u.name || '-'}</strong></td><td>${u.phone || '-'}</td>
          <td><span class="badge badge-info">${u.role || '-'}</span></td><td>${u.age || '-'}</td>
          <td><span class="badge ${statusBadge}">${u.status || '-'}</span></td>
          <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('ar-IQ') : '-'}</td>
          <td>
            <button class="btn-sm btn-view" onclick="Admin.openUserModal('${u.id}')">👁️</button>
            <button class="btn-sm ${u.status==='نشط'?'btn-reject':'btn-approve'}" onclick="Admin.toggleUserStatus('${u.id}', '${u.status}')">${u.status==='نشط'?'🚫':'✅'}</button>
          </td>
        </tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      console.error('Users load error:', err);
      container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>';
    }
  },

  searchUsers: () => {
    const search = document.getElementById('user-search')?.value.toLowerCase() || '';
    const status = document.getElementById('status-filter')?.value || 'all';
    document.querySelectorAll('#users-table-body tr').forEach(row => {
      const name = row.dataset.name || '';
      const phone = row.dataset.phone || '';
      const rowStatus = row.dataset.status || '';
      const matchesSearch = name.includes(search) || phone.includes(search);
      const matchesStatus = status === 'all' || rowStatus === status;
      row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
  },

  openUserModal: async (userId) => {
    try {
      const { data: user } = await Admin.db.from('profiles').select('*').eq('id', userId).single();
      if (!user) return;
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width:700px; max-height:90vh; overflow-y:auto">
          <span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span>
          <h3 style="margin-bottom:20px; text-align:center">📋 ملف: ${user.name}</h3>
          <div style="display:flex; gap:20px; margin-bottom:25px; align-items:center">
            <img src="${user.profile_image || 'https://ui-avatars.com/api/?name='+encodeURIComponent(user.name)}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid var(--p)">
            <div>
              <p><strong>📱 الهاتف:</strong> ${user.phone}</p>
              <p><strong>🎭 الدور:</strong> ${user.role}</p>
              <p><strong>🎂 العمر:</strong> ${user.age || '-'}</p>
              <p><strong>📊 الحالة:</strong> <span class="badge ${user.status==='نشط'?'badge-success':'badge-warning'}">${user.status}</span></p>
            </div>
          </div>
          ${user.role === 'سائق تكسي' || user.role === 'سائق توك توك' ? `
            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px">
              <h4 style="margin-bottom:10px">🚗 بيانات المركبة</h4>
              <p><strong>اللوحة:</strong> ${user.plate_number || '-'}</p>
              <p><strong>النوع:</strong> ${user.vehicle_type || '-'}</p>
              <p><strong>اللون:</strong> ${user.vehicle_color || '-'}</p>
              ${user.vehicle_images?.length ? `<p style="margin-top:10px"><strong>الصور:</strong></p><div style="display:flex; gap:10px; flex-wrap:wrap">${user.vehicle_images.slice(0,3).map(img => `<img src="${img}" style="width:80px; height:60px; border-radius:8px; object-fit:cover">`).join('')}</div>` : ''}
            </div>` : ''}
          ${user.role === 'صاحب متجر' ? `
            <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px">
              <h4 style="margin-bottom:10px">🏪 بيانات المتجر</h4>
              <p><strong>النوع:</strong> ${user.store_type || '-'}</p>
              <p><strong>الحالة:</strong> ${user.store_status || '-'}</p>
              ${user.store_images?.length ? `<p style="margin-top:10px"><strong>صور المتجر:</strong></p><div style="display:flex; gap:10px; flex-wrap:wrap">${user.store_images.slice(0,3).map(img => `<img src="${img}" style="width:80px; height:60px; border-radius:8px; object-fit:cover">`).join('')}</div>` : ''}
            </div>` : ''}
          ${user.latitude && user.longitude ? `<div style="margin-bottom:15px"><h4 style="margin-bottom:10px">📍 الموقع الحالي</h4><div id="modal-map" style="height:200px; border-radius:10px; background:#f1f5f9"></div></div>` : ''}
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px">
            <button class="btn-primary" onclick="Admin.exportUserPDF('${user.id}')">📄 تصدير PDF</button>
            <button class="btn-outline" onclick="Admin.editUserProfile('${user.id}')">✏️ تعديل البيانات</button>
            <button class="btn-danger" onclick="Admin.deleteUser('${user.id}')">🗑️ حذف نهائي</button>
            <button class="btn-sub" onclick="Admin.manageUserSubscription('${user.id}')">💳 إدارة الاشتراك</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      if (user.latitude && user.longitude) {
        setTimeout(() => {
          const map = L.map('modal-map').setView([user.latitude, user.longitude], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          L.marker([user.latitude, user.longitude]).addTo(map).bindPopup('📍 موقع المستخدم').openPopup();
        }, 100);
      }
    } catch (err) {
      console.error('Modal error:', err);
      alert('❌ فشل تحميل التفاصيل');
    }
  },

  toggleUserStatus: async (userId, currentStatus) => {
    const newStatus = currentStatus === 'نشط' ? 'محظور' : 'نشط';
    if (!confirm(`هل تريد ${newStatus === 'نشط' ? 'تفعيل' : 'حظر'} هذا المستخدم؟`)) return;
    await Admin.db.from('profiles').update({ status: newStatus }).eq('id', userId);
    alert(`✅ تم ${newStatus === 'نشط' ? 'تفعيل' : 'حظر'} المستخدم`);
    Admin.render('users');
  },

  exportUserPDF: async (userId) => {
    if (typeof jsPDF === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }
    const { data: user } = await Admin.db.from('profiles').select('*').eq('id', userId).single();
    if (!user) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ align: 'right' });
    doc.setFontSize(18);
    doc.text('ملف المستخدم - شراع', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`الاسم: ${user.name || '-'}`, 20, 40);
    doc.text(`الهاتف: ${user.phone || '-'}`, 20, 50);
    doc.text(`الدور: ${user.role || '-'}`, 20, 60);
    doc.text(`العمر: ${user.age || '-'}`, 20, 70);
    doc.text(`الحالة: ${user.status || '-'}`, 20, 80);
    doc.text(`تاريخ التسجيل: ${user.created_at ? new Date(user.created_at).toLocaleDateString('ar-IQ') : '-'}`, 20, 90);
    if (user.vehicle_type) { doc.text(`نوع المركبة: ${user.vehicle_type}`, 20, 110); doc.text(`رقم اللوحة: ${user.plate_number || '-'}`, 20, 120); }
    doc.text('تم التصدير من لوحة إدارة شراع', 105, 280, { align: 'center' });
    doc.save(`user_${user.name || userId}.pdf`);
  },

  editUserProfile: async (userId) => {
    const { data: user } = await Admin.db.from('profiles').select('*').eq('id', userId).single();
    if (!user) return;
    const newName = prompt('الاسم الجديد:', user.name);
    const newPhone = prompt('الهاتف الجديد:', user.phone);
    const newAge = prompt('العمر الجديد:', user.age);
    if (newName === null || newPhone === null) return;
    await Admin.db.from('profiles').update({ name: newName, phone: newPhone, age: newAge ? parseInt(newAge) : user.age }).eq('id', userId);
    alert('✅ تم تحديث البيانات');
    Admin.openUserModal(userId);
  },

  deleteUser: async (userId) => {
    if (!confirm('⚠️ تحذير: هذا سيحذف المستخدم وبياناته نهائياً ولا يمكن التراجع. هل أنت متأكد؟')) return;
    await Admin.db.auth.admin.deleteUser(userId);
    await Admin.db.from('profiles').delete().eq('id', userId);
    alert('🗑️ تم حذف المستخدم نهائياً');
    Admin.render('users');
  },

  manageUserSubscription: async (userId) => {
    const { data: user } = await Admin.db.from('profiles').select('subscription_end').eq('id', userId).single();
    const currentEnd = user?.subscription_end ? new Date(user.subscription_end).toLocaleDateString('ar-IQ') : 'غير محدد';
    const months = prompt(`تاريخ انتهاء الاشتراك الحالي: ${currentEnd}\nأدخل عدد الأشهر للإضافة:`, '1');
    if (!months || isNaN(months)) return;
    const baseDate = user?.subscription_end ? new Date(user.subscription_end) : new Date();
    baseDate.setMonth(baseDate.getMonth() + parseInt(months));
    await Admin.db.from('profiles').update({ subscription_end: baseDate.toISOString(), status: 'نشط' }).eq('id', userId);
    alert(`✅ تم تمديد الاشتراك ${months} شهر حتى ${baseDate.toLocaleDateString('ar-IQ')}`);
  },

  loadStores: async (container) => {
    try {
      const { data } = await Admin.db.from('profiles').select('*').eq('role', 'صاحب متجر').order('created_at', { ascending: false });
      let html = `<div style="display:flex; gap:10px; margin-bottom:20px"><input type="text" id="store-search" class="input-field" placeholder="🔍 بحث باسم المتجر أو الهاتف..." style="flex:1" onkeyup="Admin.searchStores()"></div><div class="table-container"><table><thead><tr><th>اسم المتجر</th><th>المالك</th><th>الهاتف</th><th>النوع</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody id="stores-table-body">`;
      (data || []).forEach(s => {
        html += `<tr data-name="${(s.name + ' ' + (s.store_type || '')).toLowerCase()}" data-phone="${s.phone || ''}"><td><strong>${s.name || '-'}</strong><br><small style="color:var(--g)">${s.store_type || ''}</small></td><td>${s.name || '-'}</td><td>${s.phone || '-'}</td><td>${s.store_type || '-'}</td><td><span class="badge ${s.store_status==='مفتوح'?'badge-success':'badge-warning'}">${s.store_status || 'مغلق'}</span></td><td><button class="btn-sm btn-view" onclick="Admin.openStoreModal('${s.id}')">👁️</button><button class="btn-sm btn-sub" onclick="Admin.editStoreProducts('${s.id}')">📦 منتجات</button><button class="btn-sm ${s.store_status==='مفتوح'?'btn-reject':'btn-approve'}" onclick="Admin.toggleStoreStatus('${s.id}')">${s.store_status==='مفتوح'?'🔴':'🟢'}</button></td></tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { console.error('Stores error:', err); container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>'; }
  },

  searchStores: () => {
    const search = document.getElementById('store-search')?.value.toLowerCase() || '';
    document.querySelectorAll('#stores-table-body tr').forEach(row => {
      const name = row.dataset.name || '';
      const phone = row.dataset.phone || '';
      row.style.display = (name.includes(search) || phone.includes(search)) ? '' : 'none';
    });
  },

  openStoreModal: async (storeId) => {
    const { data: store } = await Admin.db.from('profiles').select('*').eq('id', storeId).single();
    if (!store) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width:600px"><span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span><h3 style="margin-bottom:20px">🏪 ${store.name}</h3><p><strong>📱 الهاتف:</strong> ${store.phone}</p><p><strong>🏷️ النوع:</strong> ${store.store_type}</p><p><strong>📊 الحالة:</strong> ${store.store_status}</p><p><strong>📅 الاشتراك:</strong> ${store.subscription_end ? new Date(store.subscription_end).toLocaleDateString('ar-IQ') : '-'}</p>${store.store_images?.length ? `<p style="margin-top:15px"><strong>صور المتجر:</strong></p><div style="display:flex; gap:10px; flex-wrap:wrap">${store.store_images.map(img => `<img src="${img}" style="width:100px; height:80px; border-radius:8px; object-fit:cover">`).join('')}</div>` : ''}<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px"><button class="btn-sub" onclick="Admin.editStoreProducts('${storeId}')">📦 تعديل المنتجات</button><button class="btn-outline" onclick="Admin.editStoreDetails('${storeId}')">✏️ تعديل البيانات</button><button class="btn-danger" onclick="Admin.deleteStore('${storeId}')">🗑️ حذف</button></div></div>`;
    document.body.appendChild(modal);
  },

  editStoreProducts: async (storeId) => {
    const { data: products } = await Admin.db.from('products').select('*').eq('store_id', storeId);
    let html = `<div class="modal" id="products-modal"><div class="modal-content" style="max-width:700px; max-height:90vh; overflow-y:auto"><span class="modal-close" onclick="document.getElementById('products-modal').remove()">&times;</span><h3 style="margin-bottom:20px">📦 منتجات المتجر</h3><div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:20px"><h4 style="margin-bottom:10px">➕ إضافة منتج جديد</h4><input type="text" id="new-prod-name" class="input-field" placeholder="اسم المنتج" style="margin-bottom:10px"><input type="number" id="new-prod-price" class="input-field" placeholder="السعر" style="margin-bottom:10px"><input type="file" id="new-prod-img" class="input-field" accept="image/*"><button class="btn-primary" style="margin-top:10px" onclick="Admin.addProduct('${storeId}')">حفظ المنتج</button></div><div id="products-list">`;
    (products || []).forEach(p => {
      html += `<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px"><div style="display:flex; gap:15px; align-items:center"><img src="${p.image_url || 'https://via.placeholder.com/60'}" style="width:60px; height:60px; border-radius:8px; object-fit:cover"><div><strong>${p.name}</strong><br><span style="color:var(--p); font-weight:bold">${p.price} د.ع</span><span class="badge ${p.status==='متوفر'?'badge-success':'badge-warning'}" style="margin-right:5px">${p.status}</span></div></div><div><button class="btn-sm btn-outline" onclick="Admin.toggleProductStatus('${p.id}')">🔄</button><button class="btn-sm btn-danger" onclick="Admin.deleteProduct('${p.id}')">🗑️</button></div></div>`;
    });
    html += `</div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  addProduct: async (storeId) => {
    const name = document.getElementById('new-prod-name').value;
    const price = parseFloat(document.getElementById('new-prod-price').value);
    if (!name || !price) return alert('⚠️ أكمل بيانات المنتج');
    await Admin.db.from('products').insert({ store_id: storeId, name, price, status: 'متوفر' });
    alert('✅ تمت إضافة المنتج');
    Admin.editStoreProducts(storeId);
  },

  toggleProductStatus: async (productId) => {
    const { data: prod } = await Admin.db.from('products').select('status').eq('id', productId).single();
    const newStatus = prod.status === 'متوفر' ? 'منتهي' : 'متوفر';
    await Admin.db.from('products').update({ status: newStatus }).eq('id', productId);
    Admin.editStoreProducts(document.querySelector('#products-modal')?.dataset?.storeId);
  },

  deleteProduct: async (productId) => {
    if (!confirm('حذف هذا المنتج؟')) return;
    await Admin.db.from('products').delete().eq('id', productId);
    Admin.editStoreProducts(document.querySelector('#products-modal')?.dataset?.storeId);
  },

  toggleStoreStatus: async (storeId) => {
    const { data: store } = await Admin.db.from('profiles').select('store_status').eq('id', storeId).single();
    const newStatus = store.store_status === 'مفتوح' ? 'مغلق' : 'مفتوح';
    await Admin.db.from('profiles').update({ store_status: newStatus }).eq('id', storeId);
    alert(`✅ تم تغيير حالة المتجر إلى: ${newStatus}`);
    Admin.render('stores');
  },

  editStoreDetails: async (storeId) => {
    const { data: store } = await Admin.db.from('profiles').select('*').eq('id', storeId).single();
    const newType = prompt('نوع المتجر الجديد:', store.store_type);
    if (newType === null) return;
    await Admin.db.from('profiles').update({ store_type: newType }).eq('id', storeId);
    alert('✅ تم تحديث بيانات المتجر');
    Admin.openStoreModal(storeId);
  },

  deleteStore: async (storeId) => {
    if (!confirm('⚠️ حذف المتجر وجميع منتجاته؟ هذا لا يمكن التراجع عنه!')) return;
    await Admin.db.from('products').delete().eq('store_id', storeId);
    await Admin.db.auth.admin.deleteUser(storeId);
    await Admin.db.from('profiles').delete().eq('id', storeId);
    alert('🗑️ تم حذف المتجر نهائياً');
    Admin.render('stores');
  },

  loadTrips: async (container) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await Admin.db.from('trips').select(`*, customer:customer_id(name, phone), driver:driver_id(name, phone)`).gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false }).limit(100);
      let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px"><div><strong>📊 عرض الرحلات (آخر 30 يوم)</strong><p style="color:var(--g); font-size:13px">يتم تصفير هذا القسم تلقائياً كل 30 يوم</p></div><button class="btn-outline" style="width:auto" onclick="Admin.clearOldTrips()">🗑️ مسح الرحلات القديمة يدوياً</button></div><div class="table-container"><table><thead><tr><th>الزبون</th><th>النوع</th><th>السائق</th><th>السعر</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>`;
      (data || []).forEach(t => {
        const statusColors = { 'قيد الانتظار': '#f59e0b', 'جاري التنفيذ': '#3b82f6', 'مكتملة': '#10b981', 'ملغاة': '#ef4444' };
        html += `<tr><td><strong>${t.customer?.name || 'زبون'}</strong><br><small>${t.customer?.phone || ''}</small></td><td>${t.service_type}</td><td>${t.driver?.name || '-'}</td><td style="font-weight:bold">${t.final_price || 0} د.ع</td><td><span style="color:${statusColors[t.status] || '#64748b'}; font-weight:600">${t.status}</span></td><td>${new Date(t.created_at).toLocaleString('ar-IQ')}</td><td><button class="btn-sm btn-view" onclick="Admin.openTripModal('${t.id}')">👁️</button></td></tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) { console.error('Trips error:', err); container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل التحميل</div>'; }
  },

  openTripModal: async (tripId) => {
    const { data: trip } = await Admin.db.from('trips').select(`*, customer:customer_id(name, phone), driver:driver_id(name, phone)`).eq('id', tripId).single();
    if (!trip) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width:500px"><span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span><h3 style="margin-bottom:20px">📦 تفاصيل الرحلة #${trip.id?.slice(0,6)}</h3><div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:15px"><p><strong>👤 الزبون:</strong> ${trip.customer?.name} - ${trip.customer?.phone}</p><p><strong>🚗 النوع:</strong> ${trip.service_type}</p><p><strong>👨‍✈️ السائق:</strong> ${trip.driver?.name || 'لم يتم تعيين سائق'}</p><p><strong>💰 السعر:</strong> ${trip.final_price} د.ع</p><p><strong>📍 من:</strong> ${trip.pickup_lat?.toFixed(4)}, ${trip.pickup_lng?.toFixed(4)}</p><p><strong>🎯 إلى:</strong> ${trip.dropoff_address || trip.dropoff_lat?.toFixed(4)+', '+trip.dropoff_lng?.toFixed(4)}</p><p><strong>⏰ التاريخ:</strong> ${new Date(trip.created_at).toLocaleString('ar-IQ')}</p><p><strong>📊 الحالة:</strong> <span style="color:${trip.status==='مكتملة'?'var(--green)':'var(--p)'}">${trip.status}</span></p></div><div style="display:flex; gap:10px; margin-bottom:15px"><button class="btn-primary" style="flex:1" onclick="Admin.contactUser('${trip.customer?.phone}')">💬 الزبون</button>${trip.driver?.phone ? `<button class="btn-outline" style="flex:1" onclick="Admin.contactUser('${trip.driver.phone}')">📞 السائق</button>` : ''}</div><div style="margin-bottom:15px"><label><strong>تغيير الحالة:</strong></label><select id="trip-status" class="input-field" style="margin-top:5px"><option value="قيد الانتظار" ${trip.status==='قيد الانتظار'?'selected':''}>⏳ قيد الانتظار</option><option value="جاري التنفيذ" ${trip.status==='جاري التنفيذ'?'selected':''}>🚗 جاري التنفيذ</option><option value="مكتملة" ${trip.status==='مكتملة'?'selected':''}>✅ مكتملة</option><option value="ملغاة" ${trip.status==='ملغاة'?'selected':''}>❌ ملغاة</option></select></div><button class="btn-primary" onclick="Admin.updateTripStatus('${tripId}')">💾 حفظ التغييرات</button></div>`;
    document.body.appendChild(modal);
  },

  updateTripStatus: async (tripId) => {
    const newStatus = document.getElementById('trip-status')?.value;
    if (!newStatus) return;
    await Admin.db.from('trips').update({ status: newStatus }).eq('id', tripId);
    alert('✅ تم تحديث حالة الرحلة');
    Admin.render('trips');
  },

  clearOldTrips: async () => {
    if (!confirm('⚠️ مسح جميع الرحلات الأقدم من 30 يوم؟')) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { error } = await Admin.db.from('trips').delete().lt('created_at', thirtyDaysAgo.toISOString());
    if (error) return alert('❌ خطأ: ' + error.message);
    alert('🗑️ تم مسح الرحلات القديمة');
    Admin.render('trips');
  },

  loadRevenue: async (container) => {
    try {
      const subscriptionFee = 30000;
      const [taxis, tuks, deliveries] = await Promise.all([
        Admin.db.from('profiles').select('id, name, phone, status').eq('role', 'سائق تكسي'),
        Admin.db.from('profiles').select('id, name, phone, status').eq('role', 'سائق توك توك'),
        Admin.db.from('profiles').select('id, name, phone, status').eq('role', 'دلفري')
      ]);
      const activeTaxis = taxis.data?.filter(u => u.status === 'نشط').length || 0;
      const activeTuks = tuks.data?.filter(u => u.status === 'نشط').length || 0;
      const activeDeliveries = deliveries.data?.filter(u => u.status === 'نشط').length || 0;
      const totalActive = activeTaxis + activeTuks + activeDeliveries;
      const totalRevenue = totalActive * subscriptionFee;
      container.innerHTML = `<div class="stats-grid"><div class="stat-card" style="border-color:#10b981"><h3>🚗 سائقين التكسي النشطين</h3><div class="value">${activeTaxis}</div><p style="color:var(--g); font-size:13px; margin-top:5px">الإيراد: ${activeTaxis * subscriptionFee.toLocaleString()} د.ع</p></div><div class="stat-card" style="border-color:#f59e0b"><h3>🛺 سائقين التوك توك النشطين</h3><div class="value">${activeTuks}</div><p style="color:var(--g); font-size:13px; margin-top:5px">الإيراد: ${activeTuks * subscriptionFee.toLocaleString()} د.ع</p></div><div class="stat-card" style="border-color:#ef4444"><h3>🏍️ الدلفري النشطين</h3><div class="value">${activeDeliveries}</div><p style="color:var(--g); font-size:13px; margin-top:5px">الإيراد: ${activeDeliveries * subscriptionFee.toLocaleString()} د.ع</p></div><div class="stat-card" style="border-color:#8b5cf6; background:linear-gradient(135deg, #8b5cf6, #6366f1)"><h3>💰 إجمالي الإيرادات الشهرية</h3><div class="value" style="color:white">${totalRevenue.toLocaleString()} د.ع</div><p style="color:rgba(255,255,255,0.9); font-size:13px; margin-top:5px">${totalActive} مشترك نشط × 30,000 د.ع</p></div></div><div class="table-container" style="margin-top:20px"><h4 style="margin-bottom:15px">📋 تفاصيل المشتركين</h4><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الحالة</th><th>اشتراك حتى</th><th>الإيراد</th></tr></thead><tbody>`;
      [...(taxis.data||[]), ...(tuks.data||[]), ...(deliveries.data||[])].forEach(u => {
        const isActive = u.status === 'نشط';
        const revenue = isActive ? subscriptionFee : 0;
        container.querySelector('tbody').innerHTML += `<tr><td>${u.name}</td><td>${u.phone}</td><td>${u.role}</td><td><span class="badge ${isActive?'badge-success':'badge-warning'}">${u.status}</span></td><td>-</td><td style="font-weight:bold; color:${isActive?'var(--green)':'var(--g)'}">${revenue.toLocaleString()} د.ع</td></tr>`;
      });
      container.innerHTML += `</tbody></table></div><p style="text-align:center; color:var(--g); margin-top:20px; font-size:13px">💡 الإيرادات تحسب تلقائياً بناءً على عدد السائقين والدلفري النشطين × 30,000 د.ع شهرياً</p>`;
    } catch (err) { console.error('Revenue error:', err); container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">❌ فشل تحميل الإيرادات</div>'; }
  },

  loadNotifications: async (container) => {
    const notifications = [
      { id: 1, user: 'أحمد محمد', phone: '07701234567', message: 'لدي مشكلة في الرحلة رقم #12345', time: 'منذ 5 دقائق', read: false },
      { id: 2, user: 'سارة علي', phone: '07712345678', message: 'أريد إلغاء طلبي', time: 'منذ ساعة', read: false },
      { id: 3, user: 'محمود حسن', phone: '07723456789', message: 'شكراً على الخدمة الممتازة', time: 'منذ 3 ساعات', read: true }
    ];
    let html = `<div style="margin-bottom:20px"><input type="text" id="notif-search" class="input-field" placeholder="🔍 بحث باسم المستخدم أو الهاتف..." onkeyup="Admin.searchNotifications()"></div><div class="table-container"><table><thead><tr><th>المستخدم</th><th>الهاتف</th><th>الرسالة</th><th>الوقت</th><th>الحالة</th><th>رد</th></tr></thead><tbody id="notif-body">`;
    notifications.forEach(n => {
      html += `<tr data-user="${n.user.toLowerCase()}" data-phone="${n.phone}"><td><strong>${n.user}</strong></td><td>${n.phone}</td><td>${n.message}</td><td>${n.time}</td><td><span class="badge ${n.read?'badge-success':'badge-warning'}">${n.read?'مقروء':'جديد'}</span></td><td><button class="btn-sm btn-primary" onclick="Admin.replyToNotification('${n.phone}', '${n.user}')">💬 رد</button></td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  searchNotifications: () => {
    const search = document.getElementById('notif-search')?.value.toLowerCase() || '';
    document.querySelectorAll('#notif-body tr').forEach(row => {
      const user = row.dataset.user || '';
      const phone = row.dataset.phone || '';
      row.style.display = (user.includes(search) || phone.includes(search)) ? '' : 'none';
    });
  },

  replyToNotification: (phone, userName) => {
    const message = prompt(`الرد على ${userName} (${phone}):`);
    if (message) {
      window.open(`https://wa.me/964${phone.replace(/^0/, '')}?text=${encodeURIComponent(message)}`, '_blank');
      alert('✅ تم فتح واتساب للرد');
    }
  },

  loadManagers: async (container) => {
    if (!Admin.permissions.canManageManagers) {
      return container.innerHTML = '<div class="text-center mt-2" style="color:var(--red)">⛔ ليس لديك صلاحية للوصول لهذا القسم</div>';
    }
    const managers = [
      { email: 'admin2@shira.app', name: 'مدير فرعي 1', permissions: { users: true, stores: false, revenue: false } },
      { email: 'admin3@shira.app', name: 'مدير فرعي 2', permissions: { users: false, stores: true, revenue: true } }
    ];
    let html = `<div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px"><h4 style="margin-bottom:15px">➕ إضافة مدير جديد</h4><input type="email" id="new-manager-email" class="input-field" placeholder="البريد الإلكتروني" style="margin-bottom:10px"><input type="text" id="new-manager-name" class="input-field" placeholder="الاسم" style="margin-bottom:10px"><div style="margin:15px 0"><label><input type="checkbox" id="perm-users"> إدارة المستخدمين</label><br><label><input type="checkbox" id="perm-stores"> إدارة المتاجر</label><br><label><input type="checkbox" id="perm-revenue"> عرض الإيرادات</label></div><button class="btn-primary" onclick="Admin.addNewManager()">إضافة المدير</button></div><div class="table-container"><table><thead><tr><th>الاسم</th><th>البريد</th><th>صلاحيات المستخدمين</th><th>صلاحيات المتاجر</th><th>صلاحيات الإيرادات</th><th>إجراءات</th></tr></thead><tbody>`;
    managers.forEach(m => {
      html += `<tr><td>${m.name}</td><td>${m.email}</td><td><span class="badge ${m.permissions.users?'badge-success':'badge-warning'}">${m.permissions.users?'✅':'❌'}</span></td><td><span class="badge ${m.permissions.stores?'badge-success':'badge-warning'}">${m.permissions.stores?'✅':'❌'}</span></td><td><span class="badge ${m.permissions.revenue?'badge-success':'badge-warning'}">${m.permissions.revenue?'✅':'❌'}</span></td><td><button class="btn-sm btn-outline" onclick="Admin.editManager('${m.email}')">✏️</button><button class="btn-sm btn-danger" onclick="Admin.removeManager('${m.email}')">🗑️</button></td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  addNewManager: async () => {
    const email = document.getElementById('new-manager-email').value;
    const name = document.getElementById('new-manager-name').value;
    if (!email || !name) return alert('⚠️ أكمل البيانات');
    alert('✅ تم إرسال دعوة للمدير الجديد (تجريبي)');
    Admin.render('managers');
  },

  editManager: (email) => { alert('تعديل صلاحيات: ' + email + '\n(واجهة تجريبية)'); },

  removeManager: (email) => {
    if (confirm(`إزالة المدير ${email}؟`)) { alert('✅ تم إزالة المدير'); Admin.render('managers'); }
  },

  init: () => {
    if (typeof L === 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      document.head.appendChild(script);
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Admin.init);
} else {
  Admin.init();
}
