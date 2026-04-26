// ==========================================
// شراع | Shira Platform - Core Application Engine v3.3
// ✅ التحديث النهائي: استبدال جميع نوافذ المتصفح بالنافذة الأنيقة
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
      Utils.showSkeleton('#app-view');
      App.db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      App.setupListeners();
      try { await App.checkGPS(); } catch (e) { console.warn("⚠️ GPS غير متاح."); }
      await App.checkSession();
      Utils.hideSkeleton('#app-view');
    } catch (err) {
      console.error("❌ Init Error:", err);
      Utils.hideSkeleton('#app-view');
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
      Utils.showSkeleton('#app-view');
      const sessionRes = await App.db.auth.getSession();
      const session = sessionRes.data ? sessionRes.data.session : null;
      
      if (!session) {
        Utils.hideSkeleton('#app-view');
        return App.router('role-select');
      }

      App.user = session.user;
      const profRes = await App.db.from('profiles').select('*').eq('id', App.user.id).single();
      const profile = profRes.data;
      
      if (!profile) {
        Utils.hideSkeleton('#app-view');
        return App.hardLogout();
      }

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

      if (profile.status === 'قيد المراجعة') {
        Utils.hideSkeleton('#app-view');
        return App.showStatusGate('⏳', 'قيد المراجعة', 'جاري مراجعة طلبك.');
      }
      if (profile.status === 'محظور') {
        Utils.hideSkeleton('#app-view');
        return App.showStatusGate('🚫', 'تم حظر الحساب', 'تم إيقاف حسابك.');
      }
      
      App.startLiveTracking();
      Utils.hideSkeleton('#app-view');
      App.router(App.getInitialRoute());
    } catch (err) {
      console.error('Session check error:', err);
      Utils.hideSkeleton('#app-view');
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
    
    // ✅ استخدام النافذة الأنيقة لـ confirm
    const confirmed = await new Promise((resolve) => {
      showCustomAlert(
        '⚠️ تحذير هام',
        'سيتم تسجيل خروجك، وسيُحذف حسابك نهائياً بعد 5 أيام.\nلن تتمكن من الدخول بنفس الرقم إلا بعد التسجيل الجديد.\nهل تريد المتابعة؟',
        () => resolve(true),
        () => resolve(false)
      );
    });
    
    if (!confirmed) return;

    const password = prompt('🔐 أدخل كلمة المرور لتأكيد العملية:');
    if (!password) {
      alert('❌ تم إلغاء العملية.');
      return;
    }

    const loginRes = await App.db.auth.signInWithPassword({
      email: App.profile.phone + '@shira.app',
      password: password
    });
    
    if (loginRes.error) {
      alert('❌ كلمة المرور غير صحيحة.');
      return;
    }

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
    Utils.showSkeleton('#app-view');
    if (App.routes[route]) {
      container.innerHTML = App.routes[route](payload);
      Utils.hideSkeleton('#app-view');
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
      Utils.hideSkeleton('#app-view');
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
    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
      modalClose.onclick = () => document.getElementById('global-modal')?.classList.add('hidden');
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

// ==========================================
// 🎨 Views Module
// ==========================================
const Views = {
  roleSelect: () => {
    return `<div class="card" onclick="App.router('register', 'زبون')"><div class="icon">👤</div><h3>زبون</h3></div>` +
      `<div class="card" onclick="App.router('register', 'سائق تكسي')"><div class="icon">🚗</div><h3>سائق تكسي</h3></div>` +
      `<div class="card" onclick="App.router('register', 'سائق توك توك')"><div class="icon">🛺</div><h3>سائق توك توك</h3></div>` +
      `<div class="card" onclick="App.router('register', 'صاحب متجر')"><div class="icon">🏪</div><h3>صاحب متجر</h3></div>` +
      `<div class="card" onclick="App.router('register', 'دلفري')"><div class="icon">🏍️</div><h3>دلفري</h3></div>` +
      `<button onclick="App.router('login')" class="btn btn-outline mt-2">لديك حساب؟ سجل دخول</button>`;
  },
  login: () => {
    return `<div class="card glass-panel">
      <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="login-phone" class="input-field" placeholder="07..."></div>
      <div class="form-group"><label>كلمة المرور</label><input type="password" id="login-pass" class="input-field"></div>
      <button onclick="Auth.login()" class="btn btn-primary">دخول</button>
      <button onclick="App.router('role-select')" class="btn btn-outline mt-2">إنشاء حساب جديد</button>
    </div>`;
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
        <h4 style="margin-bottom: 15px; color: var(--primary);">🚗 بيانات السيارة</h4>
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
          <small style="color: var(--green); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,
      'سائق توك توك': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--primary);">🛺 بيانات التوك توك</h4>
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
          <small style="color: var(--green); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,
      'صاحب متجر': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--primary);">🏪 بيانات المتجر</h4>
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
          <small style="color: var(--green); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `,
      'دلفري': `
        <hr style="margin: 20px 0; border: 0; border-top: 2px dashed #cbd5e1;">
        <h4 style="margin-bottom: 15px; color: var(--primary);">🏍️ بيانات الدراجة</h4>
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
          <small style="color: var(--green); display: block; margin-top: 5px;">اختر 3-5 صور كحد أقصى</small>
        </div>
      `
    };
    const extraFields = roleFields[role] || '';
    return `
      <form id="reg-form" style="text-align: right;">
        ${commonFields}
        ${extraFields}
      </form>
      <button onclick="Auth.register('${role}')" class="btn btn-primary mt-2">✅ إنشاء الحساب</button>
      <button onclick="App.router('login')" class="btn btn-outline">⬅️ رجوع لتسجيل الدخول</button>
    `;
  },
  home: () => {
    return `<div class="card" onclick="App.router('request-ride', 'تاكسي')"><div class="icon">🚗</div><h3>طلب تاكسي</h3></div>` +
      `<div class="card" onclick="App.router('request-ride', 'توك توك')"><div class="icon">🛺</div><h3>طلب توك توك</h3></div>` +
      `<div class="card" onclick="App.router('shopping')"><div class="icon">🛒</div><h3>تسوق</h3></div>`;
  },
  shopping: () => {
    return `<div class="text-center" style="padding: 40px 20px;">
      <div style="font-size: 60px; margin-bottom: 20px;">🛒</div>
      <h2 style="margin-bottom: 15px;">قسم التسوق</h2>
      <p style="color: var(--text-muted); margin-bottom: 30px;">سيتم عرض المتاجر والمنتجات هنا قريباً</p>
      <button onclick="App.router('home')" class="btn btn-outline">العودة للرئيسية</button></div>`;
  },
  dashboard: () => {
    if (!App.profile) {
      setTimeout(() => App.router('login'), 100);
      return '<div class="text-center mt-2">جاري التحميل...</div>';
    }
    const name = App.profile.name || 'مستخدم';
    const role = App.profile.role || '';
    return `<div class="card"><h3>👋 ${name}</h3><p>الدور: <span class="badge" style="background:var(--accent); color:white; padding:4px 10px; border-radius:20px; font-size:12px;">${role}</span></p></div>` +
      `<div class="card" onclick="App.router('profile')"><div class="icon">📊</div><h3>الملف الشخصي</h3></div>`;
  },
  requestRide: (type) => {
    const basePrice = (type === 'تاكسي') ? 3000 : 2000;
    return `<div class="map-wrapper" style="height:300px; border-radius:12px; overflow:hidden; margin-bottom:16px;"><div id="map" style="height:100%;"></div></div>` +
      `<div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; text-align: center;">📍 اضغط على الخريطة لتحديد وجهتك</div>` +
      `<div class="form-group"><label>الوجهة المحددة</label><input type="text" id="ride-dest" class="input-field" placeholder="اضغط على الخريطة أو اكتب العنوان" readonly></div>` +
      `<div class="form-group"><label>نوع المركبة</label><input type="text" value="${type}" class="input-field" readonly></div>` +
      `<div class="card" style="display:flex; justify-content:space-between; align-items:center;"><span>💰 السعر التقديري:</span><strong style="color:var(--primary); font-size:20px;"><span id="price-val">${basePrice}</span> د.ع</strong></div>` +
      `<button onclick="Trips.request('${type}')" class="btn btn-primary">🚀 تأكيد الرحلة</button>`;
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
    const avgRating = App.profile.avg_rating || 0;
    const ratingCount = App.profile.rating_count || 0;
    const avatarUrl = profileImage ? profileImage : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=f59e0b&color=fff&size=200';
    const fallbackSvg = 'image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1OWUwYiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfkqQ8L3RleHQ+PC9zdmc+';
    const supportSection = `
      <div class="card glass-panel" style="margin-top:20px;">
        <h4 style="margin-bottom:15px; display:flex; align-items:center; gap:8px;">
          <i class="fas fa-headset"></i> الدعم والمساعدة
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button onclick="Utils.openWhatsApp()" class="btn btn-outline" style="padding:10px; font-size:13px;">
            <i class="fab fa-whatsapp"></i> واتساب
          </button>
          <button onclick="Messages.openChatModal()" class="btn btn-secondary" style="padding:10px; font-size:13px;">
            <i class="fas fa-comment"></i> مراسلة
          </button>
        </div>
        <button onclick="AboutShira.showModal()" class="btn btn-outline mt-2" style="padding:10px; font-size:13px;">
          <i class="fas fa-info-circle"></i> عن شراع
        </button>
      </div>
    `;
    const ratingSection = (role !== 'زبون' && role !== 'admin' && role !== 'owner') ? `
      <div class="card glass-panel" style="text-align:center;">
        <h4 style="margin-bottom:10px;">⭐ تقييمك العام</h4>
        <div class="rating-stars" style="font-size:1.5rem; margin:10px 0;">
          ${Rating.renderStars(avgRating)}
        </div>
        <p style="color:var(--text-muted); font-size:13px;">
          ${avgRating.toFixed(1)} من 5 • ${ratingCount} تقييم
        </p>
      </div>
    ` : '';
    return `<div class="text-center mb-2">
      <img src="${avatarUrl}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary)" onerror="this.src='${fallbackSvg}'">
      <h2 class="mt-2">${name}</h2>
      <p style="color:var(--text-muted);">${phone}</p>
      <p style="color: var(--primary); font-size: 14px; margin-top: 5px; font-weight:600;">${role}</p>
    </div>
    ${ratingSection}
    <button onclick="Profile.edit()" class="btn btn-primary mb-2">✏️ تعديل الملف الشخصي</button>
    <button onclick="App.secureLogout()" class="btn btn-danger">🚪 خروج آمن</button>
    ${supportSection}`;
  }
};

// ==========================================
// 🔐 Auth Module
// ==========================================
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
    } else if (role === 'صاحب متجر') {
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
    } else if (role === 'دلفري') {
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

    // ✅ النافذة الأنيقة بدلاً من alert
    const title = role === 'زبون' ? '✅ تم إنشاء حسابك!' : '✅ تم تسجيل طلبك!';
    const message = role === 'زبون' ? 'جاري الدخول...' : 'سيراجعه فريق الإدارة خلال 24 ساعة.';
    const onConfirm = role === 'زبون' ? () => location.reload() : () => App.router('login');
    
    showCustomAlert(title, message, onConfirm);
  }
};

// ==========================================
// 🗺️ MapUtils Module
// ==========================================
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

// ==========================================
// 📦 Trips Module
// ==========================================
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

// ==========================================
// 👤 Profile Module
// ==========================================
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

// ==========================================
// ⭐ Rating Module
// ==========================================
const Rating = {
  renderStars: (avgRating) => {
    const fullStars = Math.floor(avgRating);
    const hasHalf = avgRating % 1 >= 0.5;
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) html += '⭐';
      else if (i === fullStars && hasHalf) html += '🌟';
      else html += '☆';
    }
    return html;
  },
  showRatingModal: (tripId, revieweeId, revieweeName, onComplete) => {
    const modal = document.getElementById('global-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <h3 style="text-align:center; margin-bottom:20px;">⭐ قيّم ${revieweeName}</h3>
      <div style="text-align:center; margin:20px 0;">
        <div id="rating-input" class="rating-stars" style="font-size:2rem; cursor:pointer;">
          ☆ ☆ ☆ ☆ ☆
        </div>
        <input type="hidden" id="rating-value" value="0">
      </div>
      <div class="form-group">
        <label>تعليقك (يظهر للإدارة فقط):</label>
        <textarea id="rating-comment" class="input-field" rows="3" placeholder="اكتب رأيك هنا..."></textarea>
      </div>
      <button onclick="Rating.submit('${tripId}', '${revieweeId}')" class="btn btn-primary">إرسال التقييم</button>
    `;
    const starsContainer = body.querySelector('#rating-input');
    if (starsContainer) {
      starsContainer.onclick = (e) => {
        const value = e.target.dataset.value || 1;
        document.getElementById('rating-value').value = value;
        starsContainer.innerHTML = Rating.renderStars(value);
      };
    }
    modal.classList.remove('hidden');
  },
  submit: async (tripId, revieweeId) => {
    const rating = parseInt(document.getElementById('rating-value')?.value || '0');
    const comment = document.getElementById('rating-comment')?.value.trim() || '';
    if (rating < 1) return alert('⚠️ يرجى اختيار عدد النجوم');
    const { data: existing } = await App.db.from('reviews').select('id').eq('trip_id', tripId).single();
    if (existing) return alert('✅ لقد قيّمت هذه الرحلة مسبقاً');
    const { error } = await App.db.from('reviews').insert({
      trip_id: tripId,
      reviewer_id: App.user?.id,
      reviewee_id: revieweeId,
      rating,
      comment: comment || null
    });
    if (error) return alert('❌ فشل إرسال التقييم: ' + error.message);
    await Rating.updateAverage(revieweeId);
    document.getElementById('global-modal')?.classList.add('hidden');
    alert('✅ شكراً لتقييمك!');
  },
  updateAverage: async (userId) => {
    const { data } = await App.db.from('reviews')
      .select('rating')
      .eq('reviewee_id', userId);
    if (!data || data.length === 0) return;
    const sum = data.reduce((acc, r) => acc + r.rating, 0);
    const avg = sum / data.length;
    await App.db.from('profiles').update({
      avg_rating: parseFloat(avg.toFixed(2)),
      rating_count: data.length
    }).eq('id', userId);
  }
};

// ==========================================
// 💬 Messages Module
// ==========================================
const Messages = {
  openChatModal: () => {
    const modal = document.getElementById('global-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <h3 style="text-align:center; margin-bottom:15px;">💬 مراسلة الإدارة</h3>
      <div id="chat-messages" style="max-height:300px; overflow-y:auto; margin-bottom:15px; padding:10px; background:#f8fafc; border-radius:12px;"></div>
      <div style="display:flex; gap:10px;">
        <input type="text" id="chat-input" class="input-field" placeholder="اكتب رسالتك..." style="flex:1;">
        <button onclick="Messages.send()" class="btn btn-primary" style="width:auto; padding:12px 20px;">إرسال</button>
      </div>
      <p style="font-size:11px; color:var(--text-muted); margin-top:10px; text-align:center;">
        ⏳ تُحفظ الرسائل لمدة 24 ساعة فقط
      </p>
    `;
    modal.classList.remove('hidden');
    Messages.fetch();
  },
  fetch: async () => {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '<div class="text-center" style="color:var(--text-muted);">جاري التحميل...</div>';
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await App.db.from('messages')
      .select('*')
      .or(`sender_id.eq.${App.user?.id},receiver_id.eq.${App.user?.id}`)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: true });
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-center" style="color:var(--text-muted);">لا توجد رسائل</div>';
      return;
    }
    container.innerHTML = data.map(msg => {
      const isSent = msg.sender_id === App.user?.id;
      const time = new Date(msg.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="message-bubble ${isSent ? 'msg-sent' : 'msg-received'} ${!msg.is_read && !isSent ? 'msg-unread' : ''}">
          ${msg.content}
          <span class="msg-status">${time} ${!msg.is_read && !isSent ? '• 🟡 جديد' : ''}</span>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
    const unreadIds = data.filter(m => !m.is_read && m.receiver_id === App.user?.id).map(m => m.id);
    if (unreadIds.length > 0) {
      await App.db.from('messages').update({ is_read: true }).in('id', unreadIds);
    }
  },
  send: async () => {
    const input = document.getElementById('chat-input');
    const content = input?.value.trim();
    if (!content) return;
    const { error } = await App.db.from('messages').insert({
      sender_id: App.user?.id,
      receiver_id: CONFIG.ADMIN_USER_ID || App.user?.id,
      content,
      is_read: false
    });
    if (error) return alert('❌ فشل الإرسال: ' + error.message);
    input.value = '';
    Messages.fetch();
  }
};

// ==========================================
// ℹ️ AboutShira Module
// ==========================================
const AboutShira = {
  showModal: () => {
    const modal = document.getElementById('global-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:3rem; margin-bottom:10px;">🚀</div>
        <h2 style="margin-bottom:10px;">شراع | Shira Platform</h2>
        <p style="color:var(--text-muted); margin-bottom:20px;">منصتك الذكية للنقل والتوصيل في العراق</p>
        <div style="background:#f8fafc; padding:15px; border-radius:12px; margin-bottom:20px; text-align:right;">
          <p><strong>📱 الإصدار:</strong> 3.0.0</p>
          <p><strong>🏢 الشركة:</strong> شراع للخدمات اللوجستية</p>
          <p><strong>📍 المقر:</strong> بغداد، العراق</p>
          <p><strong>📧 الدعم:</strong> support@shira.app</p>
        </div>
        <button onclick="Utils.openWhatsApp()" class="btn btn-outline" style="margin-bottom:10px;">
          <i class="fab fa-whatsapp"></i> تواصل عبر واتساب
        </button>
        <button onclick="Messages.openChatModal()" class="btn btn-secondary">
          <i class="fas fa-comment"></i> مراسلة داخل التطبيق
        </button>
      </div>
    `;
    modal.classList.remove('hidden');
  }
};

// ==========================================
// 🛠️ Utils Module
// ==========================================
const Utils = {
  compressImage: async (file, maxWidth, quality) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
        };
      };
    });
  },
  openWhatsApp: () => {
    window.open('https://wa.me/9647722507019', '_blank');
  },
  openInAppChat: () => {
    Messages.openChatModal();
  },
  showSkeleton: (selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = `
      <div class="skeleton" style="height:20px; width:80%; margin:10px auto;"></div>
      <div class="skeleton" style="height:20px; width:60%; margin:10px auto;"></div>
      <div class="skeleton" style="height:100px; width:100%; margin:10px auto; border-radius:12px;"></div>
      <div class="skeleton" style="height:20px; width:90%; margin:10px auto;"></div>
    `;
  },
  hideSkeleton: (selector) => {}
};

// ==========================================
// 🎨 دالة النافذة المنبثقة الأنيقة (محدثة)
// ==========================================
const showCustomAlert = (title, message, onConfirm, onCancel) => {
  const hasCancel = typeof onCancel === 'function';
  
  const modal = document.createElement('div');
  modal.className = 'custom-alert-overlay';
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000; padding: 20px; animation: fadeIn 0.3s ease;
  `;
  
  modal.innerHTML = `
    <div style="
      background: white; border-radius: 20px; padding: 30px 25px;
      max-width: 400px; width: 100%; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: slideUp 0.4s ease;
    ">
      <div style="
        width: 70px; height: 70px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        border-radius: 50%; display: flex; align-items: center;
        justify-content: center; margin: 0 auto 20px; font-size: 35px;
      ">${hasCancel ? '⚠️' : '✅'}</div>
      <h3 style="margin: 0 0 10px; color: #1e293b; font-size: 22px; font-weight: 700;">${title}</h3>
      <p style="margin: 0 0 25px; color: #64748b; font-size: 15px; line-height: 1.6; white-space: pre-line;">${message}</p>
      <div style="display: grid; grid-template-columns: ${hasCancel ? '1fr 1fr' : '1fr'}; gap: 10px;">
        <button onclick="this.closest('.custom-alert-overlay').remove(); ${onConfirm ? 'onConfirm()' : ''}" style="
          padding: 14px; background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white; border: none; border-radius: 12px;
          font-size: 16px; font-weight: 600; cursor: pointer;
        ">
          ${hasCancel ? 'حسنًا' : 'إغلاق'}
        </button>
        ${hasCancel ? `
        <button onclick="this.closest('.custom-alert-overlay').remove(); if(typeof onCancel==='function')onCancel()" style="
          padding: 14px; background: #e2e8f0; color: #475569;
          border: none; border-radius: 12px;
          font-size: 16px; font-weight: 600; cursor: pointer;
        ">
          إلغاء
        </button>
        ` : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `;
  document.head.appendChild(style);
};

// ==========================================
// 🎨 استبدال جميع نوافذ المتصفح الافتراضية (الحل الجذري)
// ==========================================

// ✅ تجاوز alert() الافتراضي
window.alert = (message) => {
  showCustomAlert('تنبيه', message, null);
};

// ✅ تجاوز confirm() الافتراضي (يدعم نعم/لا)
window.confirm = (message) => {
  return new Promise((resolve) => {
    showCustomAlert('تأكيد', message, () => resolve(true), () => resolve(false));
  });
};

// ==========================================
// 🚀 التهيئة النهائية
// ==========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
