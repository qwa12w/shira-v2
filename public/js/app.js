// ==========================================
// شراع | Shira Platform - Core Application Engine
// ✅ النسخة الكاملة مع تحديثات التسجيل
// ==========================================

const App = {
  db: null,
  user: null,
  profile: null,
  map: null,
  userMarker: null,
  destMarker: null,
  gpsWatchId: null,
  currentRoute: 'home',
  routes: {},
  userLocation: null,
  destLocation: null,

  init: async () => {
    try {
      App.db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      App.setupListeners();
      try { await App.checkGPS(); } catch (e) { console.warn("⚠️ GPS غير متاح."); }
      await App.checkSession();
    } catch (err) {
      console.error("❌ Init Error:", err);
      alert('حدث خطأ أثناء تحميل التطبيق. يرجى تحديث الصفحة.');
    }
  },

  checkGPS: async () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject('No Geolocation');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          App.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const gate = document.getElementById('gate-gps');
          if (gate) gate.classList.add('hidden');
          resolve(pos);
        },
        (err) => {
          alert("⚠️ يرجى تفعيل الموقع للمتابعة.");
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  },

  checkSession: async () => {
    try {
      const sessionRes = await App.db.auth.getSession();
      const session = sessionRes.data ? sessionRes.data.session : null;
      
      if (!session) return App.router('role-select');

      App.user = session.user;
      const profRes = await App.db.from('profiles').select('*').eq('id', App.user.id).single();
      const profile = profRes.data;
      
      if (!profile) return App.hardLogout();

      if (profile.pending_deletion_at) {
        const delDate = new Date(profile.pending_deletion_at);
        const now = new Date();
        if (now >= delDate) {
          await App.db.auth.admin.deleteUser(App.user.id);
          await App.db.from('profiles').delete().eq('id', App.user.id);
          return App.hardLogout();
        } else {
          const daysLeft = Math.ceil((delDate - now) / (1000 * 60 * 60 * 24));
          alert('⚠️ حسابك قيد الحذف المؤقت.\nسيُحذف نهائياً خلال ' + daysLeft + ' يوم.');
          return App.hardLogout();
        }
      }

      App.profile = profile;
      localStorage.setItem('lastRole', profile.role || '');
      localStorage.setItem('lastRoute', (profile.role === 'زبون') ? 'home' : 'dashboard');

      if (profile.status === 'قيد المراجعة') return App.showStatusGate('⏳', 'قيد المراجعة', 'جاري مراجعة طلبك.');
      if (profile.status === 'محظور') return App.showStatusGate('🚫', 'تم حظر الحساب', 'تم إيقاف حسابك.');
      
      App.startLiveTracking();
      App.router(App.getInitialRoute());
    } catch (err) {
      console.error('Session check error:', err);
      App.hardLogout();
    }
  },

  showStatusGate: (icon, title, msg) => {
    const gate = document.getElementById('gate-status');
    const container = document.getElementById('app-container');
    if (gate) {
      gate.classList.remove('hidden');
      document.getElementById('status-icon').innerText = icon;
      document.getElementById('status-title').innerText = title;
      document.getElementById('status-msg').innerText = msg;
    }
    if (container) container.classList.add('hidden');
  },

  getInitialRoute: () => {
    try { return localStorage.getItem('lastRoute') || 'home'; }
    catch { return 'home'; }
  },

  logout: async () => {
    if (App.gpsWatchId) navigator.geolocation.clearWatch(App.gpsWatchId);
    await App.db.auth.signOut();
    try { localStorage.clear(); } catch {}
    App.router('role-select');
  },

  hardLogout: async () => {
    if (App.gpsWatchId) navigator.geolocation.clearWatch(App.gpsWatchId);
    await App.db.auth.signOut();
    try { localStorage.clear(); } catch {}
    location.replace('/');
  },

  secureLogout: async () => {
    if (!App.profile || !App.profile.phone) return alert('❌ بيانات غير مكتملة');
    
    const confirmed = confirm('⚠️ تحذير هام:\nسيتم تسجيل خروجك، وسيُحذف حسابك نهائياً بعد 5 أيام.\nلن تتمكن من الدخول بنفس الرقم إلا بعد التسجيل الجديد.\nهل تريد المتابعة؟');
    if (!confirmed) return;

    const password = prompt('🔐 أدخل كلمة المرور لتأكيد العملية:');
    if (!password) return alert('❌ تم إلغاء العملية.');

    const loginRes = await App.db.auth.signInWithPassword({
      email: App.profile.phone + '@shira.app',
      password: password
    });
    
    if (loginRes.error) return alert('❌ كلمة المرور غير صحيحة.');

    const delDate = new Date();
    delDate.setDate(delDate.getDate() + 5);
    
    await App.db.from('profiles').update({
      pending_deletion_at: delDate.toISOString(),
      status: 'محذوف مؤقتاً'
    }).eq('id', App.user.id);

    alert('✅ تم تسجيل الخروج بنجاح. سيتم حذف الحساب بعد 5 أيام.');
    await App.hardLogout();
  },

  router: (route, payload) => {
    const container = document.getElementById('app-view');
    const nav = document.getElementById('bottom-nav');
    const headerTitle = document.getElementById('header-title');
    const backBtn = document.getElementById('back-btn');

    const gate = document.getElementById('gate-status');
    const appContainer = document.getElementById('app-container');
    if (gate) gate.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');

    const isAuth = ['login', 'register', 'role-select'].includes(route);
    if (nav) nav.classList.toggle('hidden', isAuth);
    if (backBtn) {
      backBtn.classList.toggle('hidden', ['home', 'dashboard', 'login'].includes(route));
      backBtn.onclick = () => {
        const role = (App.profile && App.profile.role) ? App.profile.role : '';
        App.router(role === 'زبون' ? 'home' : 'dashboard');
      };
    }

    if (App.routes[route]) {
      container.innerHTML = App.routes[route](payload);
    } else {
      switch (route) {
        case 'role-select': container.innerHTML = Views.roleSelect(); if (headerTitle) headerTitle.innerText = 'اختر القسم'; break;
        case 'login': container.innerHTML = Views.login(); if (headerTitle) headerTitle.innerText = 'تسجيل الدخول'; break;
        case 'register': container.innerHTML = Views.register(payload); if (headerTitle) headerTitle.innerText = 'تسجيل ' + (payload || ''); break;
        case 'home': container.innerHTML = Views.home(); if (headerTitle) headerTitle.innerText = 'الرئيسية'; break;
        case 'dashboard': container.innerHTML = Views.dashboard(); if (headerTitle) headerTitle.innerText = 'لوحة التحكم'; break;
        case 'request-ride': container.innerHTML = Views.requestRide(payload); if (headerTitle) headerTitle.innerText = 'طلب رحلة'; break;
        case 'shopping': container.innerHTML = Views.shopping(); if (headerTitle) headerTitle.innerText = 'التسوق'; break;
        case 'profile': container.innerHTML = Views.profile(); if (headerTitle) headerTitle.innerText = 'الملف الشخصي'; break;
        default: container.innerHTML = '<div class="text-center mt-2">قيد التطوير</div>';
      }
    }
    App.currentRoute = route;
    App.updateNavActive(route);
    if (route === 'request-ride') {
      setTimeout(() => MapUtils.init(payload), 100);
    }
  },

  updateNavActive: (route) => {
    const items = document.querySelectorAll('.nav-item');
    items.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });
  },

  setupListeners: () => {
    const gpsBtn = document.getElementById('enable-gps-btn');
    if (gpsBtn) {
      gpsBtn.onclick = (e) => {
        e.preventDefault();
        App.checkGPS().then(() => { if (!App.user) App.checkSession(); }).catch(() => {});
      };
    }
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', () => App.router('profile'));
    
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      bottomNav.addEventListener('click', (e) => {
        const target = e.target.closest('.nav-item');
        if (target && target.dataset.route) App.router(target.dataset.route);
      });
    }
  },

  startLiveTracking: () => {
    if (!App.user || !App.user.id) return;
    if (App.gpsWatchId) navigator.geolocation.clearWatch(App.gpsWatchId);
    
    App.gpsWatchId = navigator.geolocation.watchPosition(async (pos) => {
      try {
        await App.db.from('profiles').update({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          last_seen: new Date().toISOString()
        }).eq('id', App.user.id);
      } catch (err) {
        console.warn('⚠️ فشل تحديث الموقع:', err);
      }
    }, (err) => console.warn('GPS Error:', err), { enableHighAccuracy: true });
  }
};

const Views = {
  roleSelect: () => {
    return '<div class="role-card" onclick="App.router(\'register\', \'زبون\')"><div class="icon">👤</div><h3>زبون</h3></div>' +
      '<div class="role-card" onclick="App.router(\'register\', \'سائق تكسي\')"><div class="icon">🚗</div><h3>سائق تكسي</h3></div>' +
      '<div class="role-card" onclick="App.router(\'register\', \'سائق توك توك\')"><div class="icon">🛺</div><h3>سائق توك توك</h3></div>' +
      '<div class="role-card" onclick="App.router(\'register\', \'صاحب متجر\')"><div class="icon">🏪</div><h3>صاحب متجر</h3></div>' +
      '<div class="role-card" onclick="App.router(\'register\', \'دلفري\')"><div class="icon">🏍️</div><h3>دلفري</h3></div>' +
      '<button onclick="App.router(\'login\')" class="btn-outline mt-2">لديك حساب؟ سجل دخول</button>';
  },
  
  login: () => {
    return '<div class="form-group"><label>رقم الهاتف</label><input type="tel" id="login-phone" class="input-field" placeholder="07..."></div>' +
      '<div class="form-group"><label>كلمة المرور</label><input type="password" id="login-pass" class="input-field"></div>' +
      '<button onclick="Auth.login()" class="btn-primary">دخول</button>' +
      '<button onclick="App.router(\'role-select\')" class="btn-outline mt-2">إنشاء حساب جديد</button>';
  },
  
  register: (role) => {
    const commonFields = `
      <div class="form-group">
        <label>📸 صورة الملف الشخصي</label>
        <input type="file" id="reg-photo" accept="image/*" class="input-field">
      </div>
      <div class="form-group">
        <label>الاسم الكامل *</label>
        <input type="text" id="reg-name" class="input-field" placeholder="أدخل اسمك الكامل" required>
      </div>
      <div class="form-group">
        <label>رقم الجوال *</label>
        <input type="tel" id="reg-phone" class="input-field" placeholder="07xxxxxxxxx" pattern="07[0-9]{9}" required>
      </div>
      <div class="form-group">
        <label>الجنس *</label>
        <select id="reg-gender" class="input-field" required>
          <option value="">اختر الجنس</option>
          <option value="ذكر">ذكر</option>
          <option value="أنثى">أنثى</option>
        </select>
      </div>
      <div class="form-group">
        <label>السن *</label>
        <input type="number" id="reg-age" class="input-field" placeholder="مثال: 25" min="18" max="80" required>
      </div>
      <div class="form-group">
        <label>كلمة المرور *</label>
        <input type="password" id="reg-pass" class="input-field" minlength="6" required>
      </div>
      <div class="form-group">
        <label>تأكيد كلمة المرور *</label>
        <input type="password" id="reg-pass-confirm" class="input-field" minlength="6" required>
      </div>
    `;

    const roleFields = {
      'زبون': '',

      'سائق تكسي': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--p);">🚗 بيانات السيارة</h4>
        <div class="form-group">
          <label>رقم السيارة (اللوحة) *</label>
          <input type="text" id="reg-plate" class="input-field" placeholder="مثال: ب غ د 123" required>
        </div>
        <div class="form-group">
          <label>نوع السيارة *</label>
          <input type="text" id="reg-car-type" class="input-field" placeholder="مثال: كيا أوبتيما 2020" required>
        </div>
        <div class="form-group">
          <label>لون السيارة *</label>
          <input type="text" id="reg-car-color" class="input-field" placeholder="مثال: أبيض" required>
        </div>
        <div class="form-group">
          <label>صور السيارة (من عدة زوايا) *</label>
          <input type="file" id="reg-car-photos" accept="image/*" multiple class="input-field" required>
          <small style="color: var(--g); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,

      'سائق توك توك': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--p);">🛺 بيانات التوك توك</h4>
        <div class="form-group">
          <label>رقم التوك توك *</label>
          <input type="text" id="reg-plate" class="input-field" placeholder="رقم المركبة" required>
        </div>
        <div class="form-group">
          <label>نوع التوك توك *</label>
          <input type="text" id="reg-car-type" class="input-field" placeholder="مثال: باجاج/أوروبي/صيني" required>
        </div>
        <div class="form-group">
          <label>لون التوك توك *</label>
          <input type="text" id="reg-car-color" class="input-field" placeholder="مثال: أصفر" required>
        </div>
        <div class="form-group">
          <label>صور التوك توك *</label>
          <input type="file" id="reg-car-photos" accept="image/*" multiple class="input-field" required>
          <small style="color: var(--g); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,

      'صاحب متجر': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--p);">🏪 بيانات المتجر</h4>
        <div class="form-group">
          <label>نوع المتجر *</label>
          <select id="reg-store-type" class="input-field" required>
            <option value="">اختر نوع المتجر</option>
            <option value="مطعم">🍽️ مطعم</option>
            <option value="صيدلية">💊 صيدلية</option>
            <option value="أسواق">🛒 أسواق</option>
            <option value="أسماك">🐟 أسماك</option>
            <option value="دجاج">🍗 دجاج</option>
            <option value="قصابة">🥩 قصابة</option>
            <option value="مخضر">🥬 مخضر</option>
            <option value="موبايلات">📱 موبايلات</option>
            <option value="كهربائيات">💡 كهربائيات</option>
            <option value="أسماك الزينة">🐠 أسماك الزينة</option>
            <option value="طيور وحيوانات">🐦 طيور وحيوانات</option>
            <option value="بيطرة">🐕 بيطرة</option>
            <option value="عطور">🌸 عطور</option>
            <option value="عطارية">🌿 عطارية</option>
            <option value="أخرى">📦 أخرى</option>
          </select>
        </div>
        <div class="form-group">
          <label>صور المتجر (الواجهة والداخل) *</label>
          <input type="file" id="reg-store-photos" accept="image/*" multiple class="input-field" required>
          <small style="color: var(--g); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,

      'دلفري': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--p);">🏍️ بيانات الدراجة</h4>
        <div class="form-group">
          <label>نوع الدراجة *</label>
          <input type="text" id="reg-bike-type" class="input-field" placeholder="مثال: هوندا 150" required>
        </div>
        <div class="form-group">
          <label>رقم الدراجة (اختياري)</label>
          <input type="text" id="reg-bike-plate" class="input-field" placeholder="إذا كانت مسجلة">
        </div>
        <div class="form-group">
          <label>حالة الدراجة *</label>
          <select id="reg-bike-status" class="input-field" required>
            <option value="">اختر الحالة</option>
            <option value="مسجلة">✅ مسجلة رسمياً</option>
            <option value="غير مسجلة">⚠️ غير مسجلة</option>
          </select>
        </div>
        <div class="form-group">
          <label>صور الدراجة *</label>
          <input type="file" id="reg-bike-photos" accept="image/*" multiple class="input-field" required>
          <small style="color: var(--g); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `
    };

    const extraFields = roleFields[role] || '';
    
    return `
      <form id="reg-form" style="text-align: right;">
        ${commonFields}
        ${extraFields}
      </form>
      <button onclick="Auth.register('${role}')" class="btn-primary mt-2">✅ إنشاء الحساب</button>
      <button onclick="App.router('login')" class="btn-outline">⬅️ رجوع لتسجيل الدخول</button>
    `;
  },
  
  home: () => {
    return '<div class="role-card" onclick="App.router(\'request-ride\', \'تاكسي\')"><div class="icon">🚗</div><h3>طلب تاكسي</h3></div>' +
      '<div class="role-card" onclick="App.router(\'request-ride\', \'توك توك\')"><div class="icon">🛺</div><h3>طلب توك توك</h3></div>' +
      '<div class="role-card" onclick="App.router(\'shopping\')"><div class="icon">🛒</div><h3>تسوق</h3></div>';
  },
  
  shopping: () => {
    return '<div class="text-center" style="padding: 40px 20px;">' +
      '<div style="font-size: 60px; margin-bottom: 20px;">🛒</div>' +
      '<h2 style="margin-bottom: 15px;">قسم التسوق</h2>' +
      '<p style="color: var(--g); margin-bottom: 30px;">سيتم عرض المتاجر والمنتجات هنا قريباً</p>' +
      '<button onclick="App.router(\'home\')" class="btn-outline">العودة للرئيسية</button></div>';
  },
  
  dashboard: () => {
    if (!App.profile) {
      setTimeout(() => App.router('login'), 100);
      return '<div class="text-center mt-2">جاري التحميل...</div>';
    }
    const name = App.profile.name || 'مستخدم';
    const role = App.profile.role || '';
    return '<div class="list-item"><h3>👋 ' + name + '</h3><p>الدور: <span class="badge badge-info">' + role + '</span></p></div>' +
      '<div class="role-card" onclick="App.router(\'profile\')"><div class="icon">📊</div><h3>الملف الشخصي</h3></div>';
  },
  
  requestRide: (type) => {
    const basePrice = (type === 'تاكسي') ? 3000 : 2000;
    return '<div class="map-wrapper"><div id="map"></div></div>' +
      '<div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; text-align: center;">📍 اضغط على الخريطة لتحديد وجهتك</div>' +
      '<div class="form-group"><label>الوجهة المحددة</label><input type="text" id="ride-dest" class="input-field" placeholder="اضغط على الخريطة أو اكتب العنوان" readonly></div>' +
      '<div class="form-group"><label>نوع المركبة</label><input type="text" value="' + type + '" class="input-field" readonly></div>' +
      '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center;"><span>💰 السعر التقديري:</span><strong style="color:var(--p); font-size:20px;"><span id="price-val">' + basePrice + '</span> د.ع</strong></div>' +
      '<button onclick="Trips.request(\'' + type + '\')" class="btn-primary">🚀 تأكيد الرحلة</button>';
  },
  
  profile: () => {
    if (!App.profile) {
      setTimeout(() => App.router('login'), 100);
      return '<div class="text-center mt-2">جاري التحميل...</div>';
    }
    
    const name = App.profile.name || 'مستخدم';
    const phone = App.profile.phone || '';
    const role = App.profile.role || '';
    const profileImage = App.profile.profile_image;
    
    const avatarUrl = profileImage 
      ? profileImage 
      : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=f59e0b&color=fff&size=200';
    
    const fallbackSvg = 'image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1OWUwYiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfkqQ8L3RleHQ+PC9zdmc+';
    
    return '<div class="text-center mb-2">' +
      '<img src="' + avatarUrl + '" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--p)" onerror="this.src=\'' + fallbackSvg + '\'">' +
      '<h2 class="mt-2">' + name + '</h2>' +
      '<p>' + phone + '</p>' +
      '<p style="color: var(--g); font-size: 14px; margin-top: 5px;">' + role + '</p>' +
      '</div>' +
      '<button onclick="Profile.edit()" class="btn-primary mb-2">✏️ تعديل الملف الشخصي</button>' +
      '<button onclick="App.secureLogout()" class="btn-danger">🚪 خروج آمن</button>';
  }
};

const Auth = {
  login: async () => {
    const phoneInput = document.getElementById('login-phone');
    const passInput = document.getElementById('login-pass');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const pass = passInput ? passInput.value : '';
    
    if (!phone || !pass) return alert('⚠️ أكمل البيانات');
    
    try {
      const checkRes = await App.db.from('profiles').select('pending_deletion_at').eq('phone', phone).single();
      if (checkRes.data && checkRes.data.pending_deletion_at) {
        const delDate = new Date(checkRes.data.pending_deletion_at);
        if (new Date() < delDate) {
          const days = Math.ceil((delDate - new Date()) / (1000 * 60 * 60 * 24));
          return alert('⚠️ هذا الرقم محجوز للحذف خلال ' + days + ' يوم.\nلا يمكنك الدخول إلا بالتسجيل الجديد.');
        }
      }
    } catch (e) { console.warn('Profile check skipped:', e); }
    
    const res = await App.db.auth.signInWithPassword({ email: phone + '@shira.app', password: pass });
    if (res.error) return alert('❌ ' + res.error.message);
    location.reload();
  },
  
  register: async (role) => {
    const name = document.getElementById('reg-name')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim();
    const pass = document.getElementById('reg-pass')?.value;
    const passConf = document.getElementById('reg-pass-confirm')?.value;
    const gender = document.getElementById('reg-gender')?.value;
    const age = document.getElementById('reg-age')?.value;

    if (!name || !phone || !pass || !gender || !age) {
      return alert('⚠️ يرجى إكمال جميع الحقول المطلوبة (*)');
    }
    if (pass !== passConf) {
      return alert('⚠️ كلمات المرور غير متطابقة');
    }
    if (!/^07[0-9]{9}$/.test(phone)) {
      return alert('⚠️ رقم الجوال غير صحيح (يجب أن يبدأ بـ 07 ويتكون من 10 أرقام)');
    }

    let photoUrl = null;
    const photoFile = document.getElementById('reg-photo')?.files[0];
    if (photoFile) {
      try {
        const compressed = await Utils.compressImage(photoFile, 600, 0.8);
        const fileName = 'avatars/' + Date.now() + '_' + phone + '.jpg';
        const { error: upErr, data: upData } = await App.db.storage
          .from(CONFIG.STORAGE_BUCKETS.avatars)
          .upload(fileName, compressed, { upsert: true });
        
        if (!upErr && upData?.path) {
          photoUrl = App.db.storage
            .from(CONFIG.STORAGE_BUCKETS.avatars)
            .getPublicUrl(upData.path).data.publicUrl;
        }
      } catch (e) {
        console.warn('⚠️ فشل رفع الصورة الشخصية:', e);
      }
    }

    const { data: authData, error: authErr } = await App.db.auth.signUp({
      email: phone + '@shira.app',
      password: pass,
      options: { data: { name, phone, role, gender, age: parseInt(age) } }
    });
    
    if (authErr) return alert('❌ ' + authErr.message);
    if (!authData?.user) return alert('❌ فشل إنشاء الحساب، حاول مرة أخرى');

    const userId = authData.user.id;
    let roleData = {};
    
    if (role === 'سائق تكسي' || role === 'سائق توك توك') {
      const plate = document.getElementById('reg-plate')?.value.trim();
      const carType = document.getElementById('reg-car-type')?.value.trim();
      const carColor = document.getElementById('reg-car-color')?.value.trim();
      const carPhotos = document.getElementById('reg-car-photos')?.files;
      
      if (!plate || !carType || !carColor || !carPhotos?.length) {
        return alert('⚠️ يرجى إكمال بيانات المركبة ورفع الصور');
      }
      
      let carPhotoUrls = [];
      for (let i = 0; i < Math.min(carPhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(carPhotos[i], 1000, 0.85);
          const fileName = 'vehicles/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage
            .from(CONFIG.STORAGE_BUCKETS.vehicles)
            .upload(fileName, compressed, { upsert: true });
          
          if (!upErr && upData?.path) {
            carPhotoUrls.push(
              App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).getPublicUrl(upData.path).data.publicUrl
            );
          }
        } catch (e) { console.warn('Image upload skipped:', e); }
      }
      
      roleData = {
        plate_number: plate,
        vehicle_type: carType,
        vehicle_color: carColor,
        vehicle_images: carPhotoUrls
      };
    }
    
    else if (role === 'صاحب متجر') {
      const storeType = document.getElementById('reg-store-type')?.value;
      const storePhotos = document.getElementById('reg-store-photos')?.files;
      
      if (!storeType || !storePhotos?.length) {
        return alert('⚠️ يرجى اختيار نوع المتجر ورفع الصور');
      }
      
      let storePhotoUrls = [];
      for (let i = 0; i < Math.min(storePhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(storePhotos[i], 1000, 0.85);
          const fileName = 'stores/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage
            .from(CONFIG.STORAGE_BUCKETS.products)
            .upload(fileName, compressed, { upsert: true });
          
          if (!upErr && upData?.path) {
            storePhotoUrls.push(
              App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).getPublicUrl(upData.path).data.publicUrl
            );
          }
        } catch (e) { console.warn('Store image upload skipped:', e); }
      }
      
      roleData = {
        store_type: storeType,
        store_images: storePhotoUrls,
        store_status: 'مغلق'
      };
    }
    
    else if (role === 'دلفري') {
      const bikeType = document.getElementById('reg-bike-type')?.value.trim();
      const bikePlate = document.getElementById('reg-bike-plate')?.value.trim() || null;
      const bikeStatus = document.getElementById('reg-bike-status')?.value;
      const bikePhotos = document.getElementById('reg-bike-photos')?.files;
      
      if (!bikeType || !bikeStatus || !bikePhotos?.length) {
        return alert('⚠️ يرجى إكمال بيانات الدراجة ورفع الصور');
      }
      
      let bikePhotoUrls = [];
      for (let i = 0; i < Math.min(bikePhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(bikePhotos[i], 1000, 0.85);
          const fileName = 'vehicles/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage
            .from(CONFIG.STORAGE_BUCKETS.vehicles)
            .upload(fileName, compressed, { upsert: true });
          
          if (!upErr && upData?.path) {
            bikePhotoUrls.push(
              App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).getPublicUrl(upData.path).data.publicUrl
            );
          }
        } catch (e) { console.warn('Bike image upload skipped:', e); }
      }
      
      roleData = {
        vehicle_type: bikeType,
        plate_number: bikePlate,
        bike_status: bikeStatus,
        vehicle_images: bikePhotoUrls
      };
    }

    const profileData = {
      id: userId,
      name,
      phone,
      role,
      gender,
      age: parseInt(age),
      status: role === 'زبون' ? 'نشط' : 'قيد المراجعة',
      profile_image: photoUrl,
      ...roleData
    };

    const { error: profErr } = await App.db.from('profiles').insert(profileData);
    if (profErr) return alert('❌ خطأ في حفظ البيانات: ' + profErr.message);

    const msg = role === 'زبون' 
      ? '✅ تم إنشاء حسابك بنجاح! جاري الدخول...' 
      : '✅ تم تسجيل طلبك! سيراجعه فريق الإدارة خلال 24 ساعة.';
    
    alert(msg);
    
    if (role === 'زبون') {
      location.reload();
    } else {
      App.router('login');
    }
  }
};

const MapUtils = {
  init: (serviceType) => {
    if (App.map) { App.map.remove(); App.map = null; }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    App.map = L.map('map').setView(App.userLocation || CONFIG.MAP_CENTER, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(App.map);

    if (App.userLocation) {
      App.userMarker = L.marker([App.userLocation.lat, App.userLocation.lng]).addTo(App.map).bindPopup('📍 موقعك الحالي').openPopup();
      App.map.setView([App.userLocation.lat, App.userLocation.lng], 15);
    } else {
      navigator.geolocation.getCurrentPosition((pos) => {
        App.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        App.userMarker = L.marker([App.userLocation.lat, App.userLocation.lng]).addTo(App.map).bindPopup('📍 موقعك الحالي').openPopup();
        App.map.setView([App.userLocation.lat, App.userLocation.lng], 15);
      }, (err) => console.warn('⚠️ تعذر الحصول على الموقع:', err));
    }

    App.map.on('click', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      if (App.destMarker) App.map.removeLayer(App.destMarker);
      App.destMarker = L.marker([lat, lng]).addTo(App.map).bindPopup('🎯 وجهتك').openPopup();
      App.destLocation = { lat: lat, lng: lng };
      
      const destInput = document.getElementById('ride-dest');
      if (destInput) destInput.value = 'إحداثيات: ' + lat.toFixed(4) + ', ' + lng.toFixed(4);
      
      if (App.userLocation && serviceType) {
        const distance = MapUtils.calculateDistance(App.userLocation.lat, App.userLocation.lng, lat, lng);
        const price = MapUtils.calculatePrice(distance, serviceType);
        const priceEl = document.getElementById('price-val');
        if (priceEl) priceEl.innerText = price;
      }
    });
  },

  calculateDistance: (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  calculatePrice: (distance, type) => {
    const basePrice = (type === 'تاكسي') ? 3000 : 2000;
    const pricePerKm = (type === 'تاكسي') ? 1000 / 3 : 750 / 3;
    let price = (distance <= 3) ? basePrice : basePrice + (distance - 3) * pricePerKm;
    return Math.ceil(price / 250) * 250;
  }
};

const Trips = {
  request: async (type) => {
    const destInput = document.getElementById('ride-dest');
    const dest = destInput ? destInput.value : '';
    if (!dest) return alert('⚠️ يرجى تحديد الوجهة بالضغط على الخريطة');
    
    const priceEl = document.getElementById('price-val');
    const finalPrice = priceEl ? parseInt(priceEl.innerText) : ((type === 'تاكسي') ? 3000 : 2000);
    if (!App.userLocation) return alert('⚠️ لم يتم تحديد موقعك الحالي.');
    
    const tripData = {
      customer_id: App.user.id, service_type: type, dropoff_address: dest,
      status: 'قيد الانتظار', pickup_lat: App.userLocation.lat, pickup_lng: App.userLocation.lng, final_price: finalPrice
    };
    if (App.destLocation) {
      tripData.dropoff_lat = App.destLocation.lat;
      tripData.dropoff_lng = App.destLocation.lng;
    }
    
    const res = await App.db.from('trips').insert(tripData);
    if (res.error) return alert('❌ فشل الإرسال: ' + res.error.message);
    alert('🚀 تم إرسال طلب ' + type + ' بنجاح!\nالسعر: ' + finalPrice + ' د.ع');
    App.router('home');
  }
};

const Profile = {
  edit: () => {
    if (!App.profile) return alert('⚠️ البيانات غير محملة');
    const newName = prompt('الاسم الجديد:', App.profile.name);
    if (!newName || newName.trim() === '') return;
    const newGender = prompt('الجنس (ذكر/أنثى):', App.profile.gender || 'ذكر');
    Profile.update({ name: newName.trim(), gender: newGender });
  },
  update: async (data) => {
    try {
      if (!App.user || !App.user.id) throw new Error('المستخدم غير معرف');
      const res = await App.db.from('profiles').update(data).eq('id', App.user.id);
      if (res.error) throw res.error;
      if (App.profile) Object.assign(App.profile, data);
      alert('✅ تم تحديث الملف الشخصي بنجاح');
      App.router('profile');
    } catch (err) {
      alert('❌ فشل التحديث: ' + (err.message || err));
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
