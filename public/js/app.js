// ==========================================
// شراع | Shira Platform - Core Application Engine v4.1.2 (✅ مصحح نهائي)
// ✅ نسخة جاهزة للإنتاج - جميع التعاملات نقدية (كاش)
// ==========================================

// ⚙️ إعدادات المنصة
(function() {
  if (typeof window.ShiraConfig === 'undefined') {
    window.ShiraConfig = {
      SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
      SUPABASE_KEY: 'YOUR_ANON_KEY',
      STORAGE_BUCKETS: {
        avatars: 'avatars',
        vehicles: 'vehicles', 
        products: 'products',
        stores: 'stores'
      },
      MAP_CENTER: [33.3152, 44.3661],
      ADMIN_USER_ID: 'admin-uuid-here',
      APP_VERSION: '4.1.2',
      CASH_ONLY: true
    };
  }
})();

window.CONFIG = window.CONFIG || window.ShiraConfig;
if (typeof CONFIG === 'undefined') {
  var CONFIG = window.CONFIG;
}

// ✅ التحقق من وجود Supabase
if (typeof window.supabase === 'undefined') {
  console.error('❌ Supabase library not loaded!');
  alert('خطأ في تحميل مكتبة Supabase. تأكد من إضافة script المصدر.');
}

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
  subscriptionTimer: null,
  cart: [],

  init: async () => {
    try {
      Utils.showSkeleton('#app-view');
      if (!window.supabase) throw new Error('Supabase not loaded');
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
      const session = sessionRes.data?.session || null;
      
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
      localStorage.setItem('lastRoute', App.getInitialRouteByRole(profile.role));

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
      App.router(App.getInitialRouteByRole(profile.role));
    } catch (err) {
      console.error('Session check error:', err);
      Utils.hideSkeleton('#app-view');
      App.hardLogout();
    }
  },

  getInitialRouteByRole: (role) => {
    if (!role) return 'home';
    const driverRoles = ['سائق تكسي', 'سائق توك توك', 'دلفري'];
    if (driverRoles.includes(role)) return 'dashboard';
    if (role === 'صاحب متجر') return 'dashboard';
    if (role === 'admin') return 'dashboard';
    return 'home';
  },

  showStatusGate: (icon, title, msg) => {
    const gate = document.getElementById('gate-status');
    const container = document.getElementById('app-container');
    if (gate) {
      gate.classList.remove('hidden');
      const iconEl = document.getElementById('status-icon');
      const titleEl = document.getElementById('status-title');
      const msgEl = document.getElementById('status-msg');
      if (iconEl) iconEl.innerText = icon;
      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerText = msg;
    }
    if (container) container.classList.add('hidden');
  },

  getInitialRoute: () => {
    try { return localStorage.getItem('lastRoute') || 'home'; }
    catch { return 'home'; }
  },

  logout: async () => {
    if (App.gpsWatchId) navigator.geolocation.clearWatch(App.gpsWatchId);
    if (App.subscriptionTimer) clearInterval(App.subscriptionTimer);
    await App.db.auth.signOut();
    try { localStorage.clear(); } catch {}
    App.router('role-select');
  },

  hardLogout: async () => {
    if (App.gpsWatchId) navigator.geolocation.clearWatch(App.gpsWatchId);
    if (App.subscriptionTimer) clearInterval(App.subscriptionTimer);
    await App.db.auth.signOut();
    try { localStorage.clear(); } catch {}
    location.replace('/');
  },

  secureLogout: async () => {
    if (!App.profile || !App.profile.phone) return alert('❌ بيانات غير مكتملة');
    
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
    const headerTitle = document.getElementById('header-title');
    const backBtn = document.getElementById('back-btn');
    const gate = document.getElementById('gate-status');
    const appContainer = document.getElementById('app-container');
    
    if (gate) gate.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    
    if (backBtn) {
      backBtn.classList.toggle('hidden', ['home', 'dashboard', 'login'].includes(route));
      backBtn.onclick = () => {
        const role = (App.profile && App.profile.role) ? App.profile.role : '';
        App.router(App.getInitialRouteByRole(role));
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
        case 'shopping': 
          container.innerHTML = Views.shopping(); 
          if (headerTitle) headerTitle.innerText = 'التسوق';
          setTimeout(() => Shopping.loadStores(), 100);
          break;
        case 'profile': container.innerHTML = Views.profile(); if (headerTitle) headerTitle.innerText = 'الملف الشخصي'; break;
        case 'my-orders': 
          (async () => {
            container.innerHTML = await Views.myOrders();
            Utils.hideSkeleton('#app-view');
          })();
          if (headerTitle) headerTitle.innerText = 'طلباتي';
          return;
        case 'store-products': 
          (async () => {
            container.innerHTML = await Views.storeProducts();
            Utils.hideSkeleton('#app-view');
          })();
          if (headerTitle) headerTitle.innerText = 'إدارة المنتجات';
          return;
        case 'delivery-map': container.innerHTML = Views.deliveryMap(); if (headerTitle) headerTitle.innerText = 'خريطة التوصيل'; break;
        default: container.innerHTML = '<div class="text-center mt-2">قيد التطوير</div>';
      }
      Utils.hideSkeleton('#app-view');
    }
    
    App.currentRoute = route;
    
    if (route === 'request-ride') {
      setTimeout(() => MapUtils.init(payload), 100);
    }
    if (route === 'delivery-map') {
      setTimeout(() => MapUtils.initHeatMap(), 100);
    }
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
  },

  startSubscriptionTimer: (endDate) => {
    if (App.subscriptionTimer) clearInterval(App.subscriptionTimer);
    
    const updateTimer = () => {
      const now = new Date();
      const end = new Date(endDate);
      const diff = end - now;
      
      if (diff <= 0) {
        const timerEl = document.getElementById('subscription-timer');
        if (timerEl) {
          timerEl.innerText = 'انتهى الاشتراك';
          timerEl.style.color = '#ef4444';
        }
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      const timerEl = document.getElementById('subscription-timer');
      if (timerEl) {
        timerEl.innerText = `${days}ي ${hours}س ${minutes}د`;
        timerEl.style.color = diff < 24 * 60 * 60 * 1000 ? '#ef4444' : 'var(--primary)';
      }
    };
    
    updateTimer();
    App.subscriptionTimer = setInterval(updateTimer, 60000);
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
      <div class="form-group"><label>📸 صورة الملف الشخصي</label><input type="file" id="reg-photo" accept="image/*" class="input-field"></div>
      <div class="form-group"><label>الاسم الكامل *</label><input type="text" id="reg-name" class="input-field" placeholder="أدخل اسمك الكامل" required></div>
      <div class="form-group"><label>رقم الجوال *</label><input type="tel" id="reg-phone" class="input-field" placeholder="07xxxxxxxxx" pattern="07[0-9]{9}" required></div>
      <div class="form-group"><label>الجنس *</label><select id="reg-gender" class="input-field" required><option value="">اختر الجنس</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div>
      <div class="form-group"><label>السن *</label><input type="number" id="reg-age" class="input-field" placeholder="مثال: 25" min="18" max="80" required></div>
      <div class="form-group"><label>كلمة المرور *</label><input type="password" id="reg-pass" class="input-field" minlength="6" required></div>
      <div class="form-group"><label>تأكيد كلمة المرور *</label><input type="password" id="reg-pass-confirm" class="input-field" minlength="6" required></div>
    `;

    const roleFields = {
      'زبون': '',
      'سائق تكسي': `<hr style="margin:20px 0;border:0;border-top:2px dashed #cbd5e1;"><h4 style="margin-bottom:15px;color:var(--primary);">🚗 بيانات السيارة</h4>
        <div class="form-group"><label>رقم السيارة (اللوحة) *</label><input type="text" id="reg-plate" class="input-field" placeholder="مثال: ب غ د 123" required></div>
        <div class="form-group"><label>نوع السيارة *</label><input type="text" id="reg-car-type" class="input-field" placeholder="مثال: كيا أوبتيما 2020" required></div>
        <div class="form-group"><label>لون السيارة *</label><input type="text" id="reg-car-color" class="input-field" placeholder="مثال: أبيض" required></div>
        <div class="form-group"><label>صور السيارة *</label><input type="file" id="reg-car-photos" accept="image/*" multiple class="input-field" required><small style="color:var(--green);display:block;margin-top:5px;">اختر 3-5 صور كحد أقصى</small></div>`,
      'سائق توك توك': `<hr style="margin:20px 0;border:0;border-top:2px dashed #cbd5e1;"><h4 style="margin-bottom:15px;color:var(--primary);">🛺 بيانات التوك توك</h4>
        <div class="form-group"><label>رقم التوك توك *</label><input type="text" id="reg-plate" class="input-field" placeholder="رقم المركبة" required></div>
        <div class="form-group"><label>نوع التوك توك *</label><input type="text" id="reg-car-type" class="input-field" placeholder="مثال: باجاج/أوروبي/صيني" required></div>
        <div class="form-group"><label>لون التوك توك *</label><input type="text" id="reg-car-color" class="input-field" placeholder="مثال: أصفر" required></div>
        <div class="form-group"><label>صور التوك توك *</label><input type="file" id="reg-car-photos" accept="image/*" multiple class="input-field" required><small style="color:var(--green);display:block;margin-top:5px;">اختر 3-5 صور كحد أقصى</small></div>`,
      'صاحب متجر': `<hr style="margin:20px 0;border:0;border-top:2px dashed #cbd5e1;"><h4 style="margin-bottom:15px;color:var(--primary);">🏪 بيانات المتجر</h4>
        <div class="form-group"><label>نوع المتجر *</label><select id="reg-store-type" class="input-field" required><option value="">اختر نوع المتجر</option><option value="مطعم">🍽️ مطعم</option><option value="صيدلية">💊 صيدلية</option><option value="أسواق">🛒 أسواق</option><option value="أسماك">🐟 أسماك</option><option value="دجاج">🍗 دجاج</option><option value="قصابة">🥩 قصابة</option><option value="مخضر">🥬 مخضر</option><option value="موبايلات">📱 موبايلات</option><option value="كهربائيات">💡 كهربائيات</option><option value="أخرى">📦 أخرى</option></select></div>
        <div class="form-group"><label>صور المتجر *</label><input type="file" id="reg-store-photos" accept="image/*" multiple class="input-field" required><small style="color:var(--green);display:block;margin-top:5px;">اختر 3-5 صور كحد أقصى</small></div>`,
      'دلفري': `<hr style="margin:20px 0;border:0;border-top:2px dashed #cbd5e1;"><h4 style="margin-bottom:15px;color:var(--primary);">🏍️ بيانات الدراجة</h4>
        <div class="form-group"><label>نوع الدراجة *</label><input type="text" id="reg-bike-type" class="input-field" placeholder="مثال: هوندا 150" required></div>
        <div class="form-group"><label>رقم الدراجة (اختياري)</label><input type="text" id="reg-bike-plate" class="input-field" placeholder="إذا كانت مسجلة"></div>
        <div class="form-group"><label>حالة الدراجة *</label><select id="reg-bike-status" class="input-field" required><option value="">اختر الحالة</option><option value="مسجلة">✅ مسجلة رسمياً</option><option value="غير مسجلة">⚠️ غير مسجلة</option></select></div>
        <div class="form-group"><label>صور الدراجة *</label><input type="file" id="reg-bike-photos" accept="image/*" multiple class="input-field" required><small style="color:var(--green);display:block;margin-top:5px;">اختر 3-5 صور كحد أقصى</small></div>`
    };

    const extraFields = roleFields[role] || '';
    return `<form id="reg-form" style="text-align:right;">${commonFields}${extraFields}</form>
      <button onclick="Auth.register('${role}')" class="btn btn-primary mt-2">✅ إنشاء الحساب</button>
      <button onclick="App.router('login')" class="btn btn-outline">⬅️ رجوع لتسجيل الدخول</button>`;
  },
  
  home: () => {
    if (!App.profile) return '<div class="text-center mt-2">جاري التحميل...</div>';
    const role = App.profile.role;
    if (role === 'زبون') {
      return `<div class="card" onclick="App.router('request-ride', 'تاكسي')"><div class="icon">🚗</div><h3>طلب تاكسي</h3></div>` +
        `<div class="card" onclick="App.router('request-ride', 'توك توك')"><div class="icon">🛺</div><h3>طلب توك توك</h3></div>` +
        `<div class="card" onclick="App.router('shopping')"><div class="icon">🛒</div><h3>تسوق</h3></div>` +
        `<div class="card" onclick="App.router('my-orders')"><div class="icon">📦</div><h3>طلباتي</h3></div>`;
    }
    return Views.dashboard();
  },
  
  shopping: () => {
    return `<div style="margin-bottom:15px;">
              <input type="text" id="store-search" placeholder="🔍 ابحث عن متجر..." class="input-field" onkeyup="Shopping.searchStores()">
            </div>
            <div id="stores-list" style="display:flex;flex-direction:column;gap:10px;">
              <div style="text-align:center;padding:20px;color:var(--text-muted);">⏳ جاري تحميل المتاجر...</div>
            </div>
            <button onclick="App.router('home')" class="btn btn-outline mt-2">العودة</button>`;
  },
  
  myOrders: async () => {
    const [trips, orders] = await Promise.all([
      App.db.from('trips').select('*,driver:driver_id(name,phone)').eq('customer_id', App.user.id).order('created_at',{ascending:false}).limit(20),
      App.db.from('orders').select('*,store:store_id(name),driver:driver_id(name)').eq('customer_id', App.user.id).order('created_at',{ascending:false}).limit(20)
    ]);
    const all = [...(trips.data||[]).map(t=>({...t,type:'trip'})), ...(orders.data||[]).map(o=>({...o,type:'order'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    
    return `<div style="display:flex;flex-direction:column;gap:10px;">${all.map(item => `
      <div class="card" style="text-align:right;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="background:${item.type==='trip'?'#dbeafe':'#dcfce7'};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">${item.type==='trip'?'🚗 رحلة':'📦 طلب'}</span>
          <span style="font-size:12px;color:var(--text-muted);">${new Date(item.created_at).toLocaleDateString('ar-IQ')}</span>
        </div>
        <p style="margin:5px 0;font-weight:600;">${item.type==='trip'?item.dropoff_address:item.store?.name}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <strong style="color:var(--primary);">${item.final_price||item.total_price} د.ع</strong>
          <span style="background:${item.status==='مكتملة'||item.status==='مكتمل'?'#22c55e':'#f59e0b'};color:white;padding:4px 12px;border-radius:20px;font-size:11px;">${item.status}</span>
        </div>
        ${item.type==='trip'&&item.status==='مكتملة'&&!item.rated?`<button onclick="Rating.openModal('${item.id}','${item.driver_id}')" style="margin-top:8px;padding:6px 12px;background:var(--p);color:white;border:none;border-radius:8px;font-size:12px;cursor:pointer;">⭐ تقييم السائق</button>`:''}
      </div>`).join('') || '<p class="text-center" style="color:var(--text-muted);padding:30px;">لا توجد طلبات سابقة</p>'}</div>
    <button onclick="App.router('home')" class="btn btn-outline mt-2">العودة</button>`;
  },
  
  storeProducts: async () => {
    if (!App.user?.id) return Views.dashboard();
    const { data: products } = await App.db.from('products').select('*').eq('store_id', App.user.id).order('created_at',{ascending:false});
    
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
      <h2>📦 منتجاتي</h2>
      <button onclick="Store.openAddProductModal()" class="btn btn-primary" style="padding:8px 16px;font-size:13px;">➕ إضافة</button>
    </div>
    <div style="display:grid;gap:10px;">${(products||[]).map(p => `
      <div class="card" style="display:flex;gap:12px;align-items:center;text-align:right;">
        <img src="${p.image_url||'https://via.placeholder.com/60'}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;">
        <div style="flex:1;">
          <h4 style="margin:0;font-size:14px;">${p.name}</h4>
          <p style="margin:3px 0;color:var(--primary);font-weight:600;">${p.price} د.ع</p>
          <small style="color:var(--text-muted);">${p.category||'بدون فئة'}</small>
        </div>
        <span style="background:${p.status==='نشط'?'#22c55e':'#f59e0b'};color:white;padding:4px 10px;border-radius:12px;font-size:11px;">${p.status}</span>
        <div style="display:flex;gap:5px;">
          <button onclick="Store.editProduct('${p.id}')" style="padding:6px;background:#64748b;color:white;border:none;border-radius:6px;cursor:pointer;">✏️</button>
          <button onclick="Store.deleteProduct('${p.id}')" style="padding:6px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;">🗑️</button>
        </div>
      </div>`).join('') || '<p class="text-center" style="color:var(--text-muted);">لا توجد منتجات مضافة</p>'}</div>
    <button onclick="App.router('dashboard')" class="btn btn-outline mt-2">العودة</button>`;
  },
  
  dashboard: () => {
    if (!App.profile) { setTimeout(() => App.router('login'), 100); return '<div class="text-center mt-2">جاري التحميل...</div>'; }
    const name = App.profile.name || 'مستخدم';
    const role = App.profile.role || '';
    const subscriptionEnds = App.profile.subscription_ends_at;
    
    if (['سائق تكسي', 'سائق توك توك', 'دلفري'].includes(role)) {
      const earnings = App.profile.earnings_today || 0;
      if (subscriptionEnds) setTimeout(() => App.startSubscriptionTimer(subscriptionEnds), 100);
      return `<div class="card glass-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3>👋 ${name}</h3><span class="badge" style="background:var(--accent);color:white;padding:4px 10px;border-radius:20px;font-size:12px;">${role}</span>
        </div>
        <div class="form-group" style="background:#dcfce7;padding:12px;border-radius:12px;margin-bottom:15px;border:2px solid #22c55e;">
          <label style="font-weight:600;color:#166534;">🟢 أنت نشط حالياً</label>
          <p style="font-size:13px;color:#166534;margin:5px 0 0;">ستستلم طلبات جديدة بشكل مستمر حتى انتهاء اشتراكك</p>
        </div>
        ${subscriptionEnds ? `<div class="form-group" style="background:#fff3cd;padding:12px;border-radius:12px;margin-bottom:15px;">
          <label style="font-weight:600;">⏰ الوقت المتبقي للاشتراك:</label>
          <div id="subscription-timer" style="font-size:1.2rem;font-weight:bold;margin-top:5px;">جاري الحساب...</div>
          <small style="color:var(--text-muted);">بعد الانتهاء سيتوقف استلام الطلبات تلقائياً</small>
        </div>` : ''}
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>💰 أرباح اليوم</span><strong style="font-size:1.3rem;color:var(--primary);">${earnings.toLocaleString()} د.ع</strong>
          </div>
        </div>
      </div>
      ${role === 'دلفري' ? `<div class="card" onclick="App.router('delivery-map')"><div class="icon">🔥</div><h3>خريطة المناطق الساخنة</h3><p style="color:var(--text-muted);font-size:13px;">🔴 عالية الطلب • 🟢 منخفضة الطلب</p></div>` : `<div class="card" onclick="Driver.fetchNearbyTrips()"><div class="icon">📍</div><h3>الرحلات القريبة</h3><p style="color:var(--text-muted);font-size:13px;">اضغط لعرض الطلبات القريبة منك</p></div>`}
      <div class="card" onclick="App.router('profile')"><div class="icon">📊</div><h3>إحصائياتي</h3></div>
      <div class="card" onclick="App.router('my-orders')"><div class="icon">📋</div><h3>سجل الرحلات</h3></div>`;
    }
    
    if (role === 'صاحب متجر') {
      const salesToday = App.profile.sales_today || 0;
      const storeStatus = App.profile.store_status || 'مغلق';
      return `<div class="card glass-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h3>👋 ${name}</h3><span class="badge" style="background:var(--accent);color:white;padding:4px 10px;border-radius:20px;font-size:12px;">${role}</span>
        </div>
        <div class="form-group" style="background:#f8fafc;padding:12px;border-radius:12px;margin-bottom:15px;">
          <label style="font-weight:600;">🏪 حالة المتجر:</label>
          <div style="display:flex;gap:10px;margin-top:8px;">
            <button onclick="Store.toggleStatus('مفتوح')" class="btn ${storeStatus === 'مفتوح' ? 'btn-primary' : 'btn-outline'}" style="flex:1;padding:10px;">🟢 مفتوح</button>
            <button onclick="Store.toggleStatus('مغلق')" class="btn ${storeStatus === 'مغلق' ? 'btn-danger' : 'btn-outline'}" style="flex:1;padding:10px;">🔴 مغلق</button>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-top:8px;">${storeStatus === 'مفتوح' ? 'متجرك يستقبل طلبات جديدة الآن' : 'متجرك لا يستقبل طلبات جديدة حالياً'}</p>
        </div>
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>📊 مبيعات اليوم</span><strong style="font-size:1.3rem;color:var(--primary);">${salesToday.toLocaleString()} د.ع</strong>
          </div>
        </div>
      </div>
      <div class="card" onclick="App.router('store-products')"><div class="icon">📦</div><h3>إدارة المنتجات</h3><p style="color:var(--text-muted);font-size:13px;">إضافة/تعديل/حذف المنتجات</p></div>
      <div class="card" onclick="Store.fetchNewOrders()"><div class="icon">🔔</div><h3>الطلبات الجديدة</h3><p style="color:var(--text-muted);font-size:13px;">استقبال ومتابعة الطلبات</p></div>
      <div class="card" onclick="Store.trackDeliveries()"><div class="icon">🚚</div><h3>متابعة التوصيل</h3><p style="color:var(--text-muted);font-size:13px;">حالة طلبات التوصيل</p></div>
      <div class="card" onclick="App.router('profile')"><div class="icon">📈</div><h3>الإحصائيات</h3></div>`;
    }
    
    if (role === 'admin') {
      return `<div class="card glass-panel"><h3>👋 لوحة تحكم المدير</h3><p style="color:var(--text-muted);">إدارة شاملة للتطبيق</p></div>
        <div class="card"><div class="icon">👥</div><h3>المستخدمين</h3></div>
        <div class="card"><div class="icon">🚗</div><h3>السائقين</h3></div>
        <div class="card"><div class="icon">🏪</div><h3>المتاجر</h3></div>
        <div class="card"><div class="icon">📈</div><h3>الإحصائيات</h3></div>
        <div class="card"><div class="icon">⚙️</div><h3>الإعدادات</h3></div>`;
    }
    
    return `<div class="card"><h3>👋 ${name}</h3><p>الدور: <span class="badge" style="background:var(--accent);color:white;padding:4px 10px;border-radius:20px;font-size:12px;">${role}</span></p></div>
      <div class="card" onclick="App.router('profile')"><div class="icon">📊</div><h3>الملف الشخصي</h3></div>`;
  },
  
  requestRide: (type) => {
    const basePrice = (type === 'تاكسي') ? 3000 : 2000;
    return `<div class="map-wrapper" style="height:300px;border-radius:12px;overflow:hidden;margin-bottom:16px;"><div id="map" style="height:100%;"></div></div>
      <div style="background:#fff3cd;padding:10px;border-radius:8px;margin-bottom:15px;font-size:13px;text-align:center;">📍 اضغط على الخريطة لتحديد وجهتك</div>
      <div class="form-group"><label>الوجهة المحددة</label><input type="text" id="ride-dest" class="input-field" placeholder="اضغط على الخريطة أو اكتب العنوان" readonly></div>
      <div class="form-group"><label>نوع المركبة</label><input type="text" value="${type}" class="input-field" readonly></div>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;"><span>💰 السعر التقديري:</span><strong style="color:var(--primary);font-size:20px;"><span id="price-val">${basePrice}</span> د.ع</strong></div>
      <div class="form-group" style="background:#dbeafe;padding:10px;border-radius:8px;margin:10px 0;">
        <label style="font-weight:600;">💵 طريقة الدفع:</label>
        <p style="font-size:13px;color:#1e40af;margin:5px 0 0;">✅ الدفع نقداً عند الوصول (كاش)</p>
      </div>
      <button onclick="Trips.request('${type}')" class="btn btn-primary">🚀 تأكيد الرحلة - دفع كاش</button>`;
  },
  
  profile: () => {
    if (!App.profile) { setTimeout(() => App.router('login'), 100); return '<div class="text-center mt-2">جاري التحميل...</div>'; }
    const name = App.profile.name || 'مستخدم';
    const phone = App.profile.phone || '';
    const role = App.profile.role || '';
    const profileImage = App.profile.profile_image;
    const avgRating = App.profile.avg_rating || 0;
    const ratingCount = App.profile.rating_count || 0;
    const avatarUrl = profileImage ? profileImage : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=f59e0b&color=fff&size=200';
    const fallbackSvg = 'image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1OWUwYiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfkqQ8L3RleHQ+PC9zdmc+';
    
    const supportSection = `<div class="card glass-panel" style="margin-top:20px;">
      <h4 style="margin-bottom:15px;display:flex;align-items:center;gap:8px;"><i class="fas fa-headset"></i> الدعم والمساعدة</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button onclick="Utils.openWhatsApp()" class="btn btn-outline" style="padding:10px;font-size:13px;"><i class="fab fa-whatsapp"></i> واتساب</button>
        <button onclick="Messages.openChatModal()" class="btn btn-secondary" style="padding:10px;font-size:13px;"><i class="fas fa-comment"></i> مراسلة</button>
      </div>
      <button onclick="AboutShira.showModal()" class="btn btn-outline mt-2" style="padding:10px;font-size:13px;"><i class="fas fa-info-circle"></i> عن شراع</button>
    </div>`;
    
    const ratingSection = (role !== 'زبون' && role !== 'admin' && role !== 'owner') ? `
      <div class="card glass-panel" style="text-align:center;">
        <h4 style="margin-bottom:10px;">⭐ تقييمك العام</h4>
        <div class="rating-stars" style="font-size:1.5rem;margin:10px 0;">${Rating.renderStars(avgRating)}</div>
        <p style="color:var(--text-muted);font-size:13px;">${avgRating.toFixed(1)} من 5 • ${ratingCount} تقييم</p>
      </div>` : '';
    
    return `<div class="text-center mb-2" style="padding-top:20px;">
      <img src="${avatarUrl}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary)" onerror="this.src='${fallbackSvg}'">
      <h2 class="mt-2">${name}</h2><p style="color:var(--text-muted);">${phone}</p>
      <p style="color:var(--primary);font-size:14px;margin-top:5px;font-weight:600;">${role}</p>
    </div>${ratingSection}
    <button onclick="Profile.edit()" class="btn btn-primary mb-2">✏️ تعديل الملف الشخصي</button>
    <button onclick="App.secureLogout()" class="btn btn-danger">🚪 خروج آمن</button>
    ${supportSection}`;
  },
  
  deliveryMap: () => `<div class="map-wrapper" style="height:400px;border-radius:12px;overflow:hidden;margin-bottom:16px;"><div id="map" style="height:100%;"></div></div>
    <div style="background:#f8fafc;padding:15px;border-radius:12px;margin-bottom:15px;">
      <h4 style="margin-bottom:10px;">🔥 خريطة المناطق الساخنة</h4>
      <div style="display:flex;gap:10px;font-size:13px;">
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:12px;height:12px;background:#ef4444;border-radius:50%;"></span> طلبات كثيرة</span>
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:12px;height:12px;background:#22c55e;border-radius:50%;"></span> طلبات قليلة</span>
      </div>
    </div>
    <button onclick="App.router('dashboard')" class="btn btn-outline">العودة</button>`
};

// ==========================================
// 🔐 Auth Module
// ==========================================
const Auth = {
  login: async () => {
    const phoneInput = document.getElementById('login-phone');
    const passInput = document.getElementById('login-pass');
    const phone = phoneInput?.value.trim() || '';
    const pass = passInput?.value || '';
    if (!phone || !pass) return alert('⚠️ أكمل البيانات');
    
    try {
      const checkRes = await App.db.from('profiles').select('pending_deletion_at').eq('phone', phone).single();
      if (checkRes.data?.pending_deletion_at) {
        const delDate = new Date(checkRes.data.pending_deletion_at);
        if (new Date() < delDate) {
          const days = Math.ceil((delDate - new Date()) / (1000 * 60 * 60 * 24));
          return alert('⚠️ هذا الرقم محجوز للحذف خلال ' + days + ' يوم.\nلا يمكنك الدخول إلا بالتسجيل الجديد.');
        }
      }
    } catch (e) { console.warn('Profile check skipped:', e); }
    
    const res = await App.db.auth.signInWithPassword({ email: phone + '@shira.app', password: pass });
    if (res.error) return alert('❌ ' + res.error.message);
    window.location.reload();
  },
  
  register: async (role) => {
    const name = document.getElementById('reg-name')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim();
    const pass = document.getElementById('reg-pass')?.value;
    const passConf = document.getElementById('reg-pass-confirm')?.value;
    const gender = document.getElementById('reg-gender')?.value;
    const age = document.getElementById('reg-age')?.value;
    
    if (!name || !phone || !pass || !gender || !age) return alert('⚠️ يرجى إكمال جميع الحقول المطلوبة (*)');
    if (pass !== passConf) return alert('⚠️ كلمات المرور غير متطابقة');
    if (!/^07[0-9]{9}$/.test(phone)) return alert('⚠️ رقم الجوال غير صحيح (يجب أن يبدأ بـ 07 ويتكون من 10 أرقام)');
    
    let photoUrl = null;
    const photoFile = document.getElementById('reg-photo')?.files[0];
    if (photoFile) {
      try {
        const compressed = await Utils.compressImage(photoFile, 600, 0.8);
        const fileName = 'avatars/' + Date.now() + '_' + phone + '.jpg';
        const { error: upErr, data: upData } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.avatars).upload(fileName, compressed, { upsert: true });
        if (!upErr && upData?.path) {
          photoUrl = App.db.storage.from(CONFIG.STORAGE_BUCKETS.avatars).getPublicUrl(upData.path).data.publicUrl;
        }
      } catch (e) { console.warn('⚠️ فشل رفع الصورة الشخصية:', e); }
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
      if (!plate || !carType || !carColor || !carPhotos?.length) return alert('⚠️ يرجى إكمال بيانات المركبة ورفع الصور');
      
      let carPhotoUrls = [];
      for (let i = 0; i < Math.min(carPhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(carPhotos[i], 1000, 0.85);
          const fileName = 'vehicles/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).upload(fileName, compressed, { upsert: true });
          if (!upErr && upData?.path) {
            carPhotoUrls.push(App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).getPublicUrl(upData.path).data.publicUrl);
          }
        } catch (e) { console.warn('Image upload skipped:', e); }
      }
      roleData = { plate_number: plate, vehicle_type: carType, vehicle_color: carColor, vehicle_images: carPhotoUrls };
    } else if (role === 'صاحب متجر') {
      const storeType = document.getElementById('reg-store-type')?.value;
      const storePhotos = document.getElementById('reg-store-photos')?.files;
      if (!storeType || !storePhotos?.length) return alert('⚠️ يرجى اختيار نوع المتجر ورفع الصور');
      
      let storePhotoUrls = [];
      for (let i = 0; i < Math.min(storePhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(storePhotos[i], 1000, 0.85);
          const fileName = 'stores/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).upload(fileName, compressed, { upsert: true });
          if (!upErr && upData?.path) {
            storePhotoUrls.push(App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).getPublicUrl(upData.path).data.publicUrl);
          }
        } catch (e) { console.warn('Store image upload skipped:', e); }
      }
      roleData = { store_type: storeType, store_images: storePhotoUrls, store_status: 'مغلق' };
    } else if (role === 'دلفري') {
      const bikeType = document.getElementById('reg-bike-type')?.value.trim();
      const bikePlate = document.getElementById('reg-bike-plate')?.value.trim() || null;
      const bikeStatus = document.getElementById('reg-bike-status')?.value;
      const bikePhotos = document.getElementById('reg-bike-photos')?.files;
      if (!bikeType || !bikeStatus || !bikePhotos?.length) return alert('⚠️ يرجى إكمال بيانات الدراجة ورفع الصور');
      
      let bikePhotoUrls = [];
      for (let i = 0; i < Math.min(bikePhotos.length, 5); i++) {
        try {
          const compressed = await Utils.compressImage(bikePhotos[i], 1000, 0.85);
          const fileName = 'vehicles/' + userId + '_' + Date.now() + '_' + i + '.jpg';
          const { error: upErr, data: upData } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).upload(fileName, compressed, { upsert: true });
          if (!upErr && upData?.path) {
            bikePhotoUrls.push(App.db.storage.from(CONFIG.STORAGE_BUCKETS.vehicles).getPublicUrl(upData.path).data.publicUrl);
          }
        } catch (e) { console.warn('Bike image upload skipped:', e); }
      }
      roleData = { vehicle_type: bikeType, plate_number: bikePlate, bike_status: bikeStatus, vehicle_images: bikePhotoUrls };
    }
    
    const profileData = {
      id: userId, name, phone, role, gender, age: parseInt(age),
      status: role === 'زبون' ? 'نشط' : 'قيد المراجعة',
      profile_image: photoUrl, ...roleData
    };
    
    const { error: profErr } = await App.db.from('profiles').insert(profileData);
    if (profErr) return alert('❌ خطأ في حفظ البيانات: ' + profErr.message);

    const title = role === 'زبون' ? '✅ تم إنشاء حسابك!' : '✅ تم تسجيل طلبك!';
    const message = role === 'زبون' ? 'جاري الدخول...' : 'سيراجعه فريق الإدارة خلال 24 ساعة.';
    const onConfirm = role === 'زبون' ? () => window.location.reload() : () => App.router('login');
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
      const lat = e.latlng.lat, lng = e.latlng.lng;
      if (App.destMarker) App.map.removeLayer(App.destMarker);
      App.destMarker = L.marker([lat, lng]).addTo(App.map).bindPopup('🎯 وجهتك').openPopup();
      App.destLocation = { lat, lng };
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
  
  initHeatMap: () => {
    if (App.map) { App.map.remove(); App.map = null; }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    App.map = L.map('map').setView(App.userLocation || CONFIG.MAP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(App.map);
    const heatData = [[33.3152,44.3661,0.9],[33.32,44.37,0.7],[33.31,44.36,0.8],[33.28,44.32,0.3],[33.29,44.33,0.2],[33.34,44.39,0.6]];
    heatData.forEach(([lat,lng,intensity]) => {
      const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f59e0b' : '#22c55e';
      L.circle([lat,lng], { color, fillColor: color, fillOpacity: 0.3, radius: intensity*300 }).addTo(App.map).bindPopup(`كثافة الطلب: ${Math.round(intensity*100)}%`);
    });
    if (App.userLocation) App.userMarker = L.marker([App.userLocation.lat, App.userLocation.lng]).addTo(App.map).bindPopup('📍 موقعك').openPopup();
  },
  
  calculateDistance: (lat1,lon1,lat2,lon2) => {
    const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  },
  
  calculatePrice: (distance,type) => {
    const basePrice = type==='تاكسي'?3000:2000, pricePerKm = type==='تاكسي'?1000/3:750/3;
    let price = distance<=3?basePrice:basePrice+(distance-3)*pricePerKm;
    return Math.ceil(price/250)*250;
  }
};

// ==========================================
// 📦 Trips Module
// ==========================================
const Trips = {
  request: async (type) => {
    const destInput = document.getElementById('ride-dest');
    const dest = destInput?.value || '';
    if (!dest) return alert('⚠️ يرجى تحديد الوجهة بالضغط على الخريطة');
    const priceEl = document.getElementById('price-val');
    const finalPrice = priceEl ? parseInt(priceEl.innerText) : (type==='تاكسي'?3000:2000);
    if (!App.userLocation) return alert('⚠️ لم يتم تحديد موقعك الحالي.');
    
    const tripData = {
      customer_id: App.user.id, service_type: type, dropoff_address: dest,
      status: 'قيد الانتظار', pickup_lat: App.userLocation.lat, pickup_lng: App.userLocation.lng,
      final_price: finalPrice, payment_method: 'cash', payment_status: 'غير مدفوع'
    };
    if (App.destLocation) { tripData.dropoff_lat = App.destLocation.lat; tripData.dropoff_lng = App.destLocation.lng; }
    
    const { error } = await App.db.from('trips').insert(tripData);
    if (error) return alert('❌ فشل الإرسال: ' + error.message);
    
    Notifications.show('🚀 تم إرسال طلبك!', `سيتم البحث عن ${type} قريب...\n💵 الدفع: نقدًا عند الوصول`, 'success');
    setTimeout(() => App.router('home'), 3000);
  },
  
  fetchMyTrips: async () => {
    if (!App.user?.id) return [];
    const { data, error } = await App.db.from('trips').select('*').eq('customer_id', App.user.id).order('created_at',{ascending:false}).limit(20);
    return error ? [] : (data || []);
  },
  
  acceptTrip: async (tripId) => {
    const { error } = await App.db.from('trips').update({ status:'مقبولة', driver_id:App.user.id, accepted_at:new Date().toISOString() }).eq('id',tripId);
    if (error) { alert('❌ فشل قبول الرحلة: '+error.message); return false; }
    Notifications.show('✅ قبلت الرحلة', 'توجه إلى موقع العميل', 'success'); return true;
  },
  
  completeTrip: async (tripId) => {
    const { error } = await App.db.from('trips').update({ 
      status:'مكتملة', completed_at:new Date().toISOString(), payment_status:'مدفوع' 
    }).eq('id',tripId);
    if (error) { alert('❌ فشل إكمال الرحلة: '+error.message); return false; }
    
    const trip = (await App.db.from('trips').select('final_price').eq('id',tripId).single()).data;
    if (trip?.final_price) {
      await App.db.rpc('increment_driver_earnings',{ driver_id:App.user.id, amount:trip.final_price });
    }
    Notifications.show('✅ اكتملت الرحلة', 'تم استلام الدفع نقداً ✓', 'success'); return true;
  }
};

// ==========================================
// 👤 Profile Module
// ==========================================
const Profile = {
  edit: () => {
    if (!App.profile) return alert('⚠️ البيانات غير محملة');
    const newName = prompt('الاسم الجديد:', App.profile.name);
    if (!newName?.trim()) return;
    const newGender = prompt('الجنس (ذكر/أنثى):', App.profile.gender||'ذكر');
    Profile.update({ name:newName.trim(), gender:newGender });
  },
  update: async (data) => {
    try {
      if (!App.user?.id) throw new Error('المستخدم غير معرف');
      const res = await App.db.from('profiles').update(data).eq('id', App.user.id);
      if (res.error) throw res.error;
      if (App.profile) Object.assign(App.profile, data);
      alert('✅ تم تحديث الملف الشخصي بنجاح'); App.router('profile');
    } catch (err) { alert('❌ فشل التحديث: '+(err.message||err)); }
  }
};

// ==========================================
// 🚗 Driver Module
// ==========================================
const Driver = {
  fetchNearbyTrips: async () => {
    if (!App.userLocation) return alert('⚠️ يرجى تفعيل الموقع أولاً');
    const { data, error } = await App.db.from('trips').select(`*,customer:customer_id(name,phone)`).eq('status','قيد الانتظار').is('driver_id',null).order('created_at',{ascending:false}).limit(10);
    if (error) { console.error('Error:',error); return []; }
    const nearby = data.filter(t => t.pickup_lat && t.pickup_lng && MapUtils.calculateDistance(App.userLocation.lat,App.userLocation.lng,t.pickup_lat,t.pickup_lng)<=5);
    if (nearby.length===0) return alert('🔍 لا توجد رحلات قريبة حالياً');
    nearby.forEach(t => {
      const dist = MapUtils.calculateDistance(App.userLocation.lat,App.userLocation.lng,t.pickup_lat,t.pickup_lng).toFixed(1);
      Notifications.show('🚀 طلب جديد!', `مسافة: ${dist} كم - ${t.service_type}\n💵 الدفع: كاش`, 'trip', ()=>Driver.acceptTrip(t.id));
    });
  },
  acceptTrip: async (tripId) => {
    const { error } = await App.db.from('trips').update({ status:'مقبولة', driver_id:App.user.id, accepted_at:new Date().toISOString() }).eq('id',tripId);
    if (error) { alert('❌ فشل قبول الرحلة: '+error.message); return; }
    Notifications.show('✅ قبلت الرحلة', 'توجه إلى موقع العميل', 'success');
    App.router('dashboard');
  }
};

// ==========================================
// 🏪 Store Module
// ==========================================
const Store = {
  toggleStatus: async (status) => {
    if (!App.user?.id) return;
    try {
      await App.db.from('profiles').update({ store_status:status, status_updated_at:new Date().toISOString() }).eq('id',App.user.id);
      if (App.profile) App.profile.store_status = status;
      App.router('dashboard');
      Notifications.show(status==='مفتوح'?'🟢 المتجر مفتوح':'🔴 المتجر مغلق', status==='مفتوح'?'متجرك يستقبل طلبات جديدة الآن':'تم إيقاف استقبال الطلبات', 'success');
    } catch (err) { alert('❌ فشل التحديث: '+err.message); }
  },
  
  fetchNewOrders: async () => {
    if (!App.user?.id) return [];
    const { data, error } = await App.db.from('orders').select(`*,customer:customer_id(name,phone),items:order_items(*)`).eq('store_id',App.user.id).in('status',['جديد','قيد التحضير']).order('created_at',{ascending:false});
    if (error) { console.error('Error:',error); return []; }
    if (!data?.length) return alert('📭 لا توجد طلبات جديدة');
    data.forEach(o => Notifications.show('📦 طلب جديد!', `من: ${o.customer?.name}\n💵 الدفع: كاش`, 'order', ()=>Store.acceptOrder(o.id)));
    return data;
  },
  
  acceptOrder: async (orderId) => {
    const { error } = await App.db.from('orders').update({ status:'مقبول', accepted_at:new Date().toISOString() }).eq('id',orderId);
    if (error) { alert('❌ فشل قبول الطلب: '+error.message); return false; }
    Notifications.show('✅ تم قبول الطلب', 'ابدأ التحضير - الدفع عند الاستلام', 'success'); return true;
  },
  
  trackDeliveries: async () => {
    if (!App.user?.id) return [];
    const { data, error } = await App.db.from('orders').select(`*,customer:customer_id(name,phone,latitude,longitude),driver:driver_id(name,phone)`).eq('store_id',App.user.id).eq('status','قيد التوصيل').order('created_at',{ascending:false});
    return error ? [] : (data||[]);
  },
  
  openAddProductModal: () => {
    showCustomAlert('➕ إضافة منتج جديد', `
      <form id="add-product-form" style="display:grid;gap:10px;">
        <input type="text" id="prod-name" placeholder="اسم المنتج *" required style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <textarea id="prod-desc" placeholder="وصف المنتج" rows="2" style="padding:10px;border:1px solid #ddd;border-radius:8px;"></textarea>
        <input type="number" id="prod-price" placeholder="السعر (د.ع) *" required min="0" step="0.01" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <input type="text" id="prod-cat" placeholder="الفئة" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <input type="file" id="prod-img" accept="image/*" style="padding:8px;border:1px solid #ddd;border-radius:8px;">
        <select id="prod-status" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
          <option value="نشط">✅ نشط</option><option value="مخفي">🙈 مخفي</option><option value="نفذت الكمية">📭 نفذت الكمية</option>
        </select>
      </form>
    `, async () => {
      const name = document.getElementById('prod-name')?.value.trim();
      const price = parseFloat(document.getElementById('prod-price')?.value);
      if (!name || !price) return alert('⚠️ اسم المنتج والسعر مطلوبان');
      
      let imageUrl = null;
      const file = document.getElementById('prod-img')?.files?.[0];
      if (file) {
        const compressed = await Utils.compressImage(file, 800, 0.85);
        const fileName = `products/${App.user.id}/${Date.now()}.jpg`;
        const { data: upData } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).upload(fileName, compressed, { upsert: true });
        if (upData?.path) imageUrl = App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).getPublicUrl(upData.path).data.publicUrl;
      }
      
      const { error } = await App.db.from('products').insert({
        store_id: App.user.id, name, description: document.getElementById('prod-desc')?.value.trim()||null,
        price, category: document.getElementById('prod-cat')?.value.trim()||null,
        image_url: imageUrl, status: document.getElementById('prod-status')?.value||'نشط'
      });
      if (error) return alert('❌ فشل الإضافة: '+error.message);
      alert('✅ تمت إضافة المنتج'); App.router('store-products');
    });
  },
  
  editProduct: async (productId) => {
    const { data: p } = await App.db.from('products').select('*').eq('id', productId).single();
    if (!p) return;
    showCustomAlert('✏️ تعديل المنتج', `
      <form id="edit-product-form" style="display:grid;gap:10px;">
        <input type="text" id="prod-name" value="${p.name.replace(/"/g, '&quot;')}" required style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <textarea id="prod-desc" rows="2" style="padding:10px;border:1px solid #ddd;border-radius:8px;">${p.description||''}</textarea>
        <input type="number" id="prod-price" value="${p.price}" required min="0" step="0.01" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <input type="text" id="prod-cat" value="${p.category||''}" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
        <select id="prod-status" style="padding:10px;border:1px solid #ddd;border-radius:8px;">
          <option value="نشط" ${p.status==='نشط'?'selected':''}>✅ نشط</option>
          <option value="مخفي" ${p.status==='مخفي'?'selected':''}>🙈 مخفي</option>
          <option value="نفذت الكمية" ${p.status==='نفذت الكمية'?'selected':''}>📭 نفذت الكمية</option>
        </select>
      </form>
    `, async () => {
      const { error } = await App.db.from('products').update({
        name: document.getElementById('prod-name')?.value.trim(),
        description: document.getElementById('prod-desc')?.value.trim()||null,
        price: parseFloat(document.getElementById('prod-price')?.value),
        category: document.getElementById('prod-cat')?.value.trim()||null,
        status: document.getElementById('prod-status')?.value
      }).eq('id', productId);
      if (error) return alert('❌ فشل التحديث: '+error.message);
      alert('✅ تم تحديث المنتج'); App.router('store-products');
    });
  },
  
  deleteProduct: async (productId) => {
    if (!confirm('⚠️ حذف هذا المنتج نهائياً؟')) return;
    const { error } = await App.db.from('products').delete().eq('id', productId);
    if (error) return alert('❌ فشل الحذف: '+error.message);
    alert('🗑️ تم حذف المنتج'); App.router('store-products');
  }
};

// ==========================================
// 🛒 Shopping Module
// ==========================================
const Shopping = {
  
  loadStores: async () => {
    const container = document.getElementById('stores-list');
    if (!container) return;
    if (!App.userLocation) { await App.checkGPS(); }
    
    const { data: stores, error } = await App.db.from('profiles')
      .select('id,name,profile_image,store_type,store_status,avg_rating')
      .eq('role', 'صاحب متجر')
      .eq('status', 'نشط');

    if (error || !stores) { container.innerHTML = '<p style="text-align:center;color:red;">❌ فشل تحميل المتاجر</p>'; return; }

    stores.sort((a, b) => {
      const openA = a.store_status === 'مفتوح';
      const openB = b.store_status === 'مفتوح';
      if (openA && !openB) return -1;
      if (!openA && openB) return 1;
      return (b.avg_rating || 0) - (a.avg_rating || 0);
    });

    if (stores.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد متاجر مسجلة حالياً</p>';
      return;
    }

    container.innerHTML = stores.map(s => {
      const isClosed = s.store_status !== 'مفتوح';
      return `
      <div class="card" onclick="Shopping.openStore('${s.id}','${s.name}')" style="cursor:pointer;opacity:${isClosed?0.8:1};">
        <div style="display:flex;gap:12px;align-items:center;">
          <img src="${s.profile_image||'https://ui-avatars.com/api/?name='+encodeURIComponent(s.name)}" style="width:60px;height:60px;border-radius:12px;object-fit:cover;">
          <div style="flex:1;">
            <h4 style="margin:0;">${s.name}</h4>
            <p style="margin:3px 0;color:var(--text-muted);font-size:13px;">${s.store_type} • ⭐ ${s.avg_rating?.toFixed(1)||'0.0'}</p>
          </div>
          <span style="background:${isClosed?'#fee2e2':'#dcfce7'};color:${isClosed?'#ef4444':'#166534'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:bold;">
            ${isClosed ? 'مغلق 🔴' : 'مفتوح 🟢'}
          </span>
        </div>
      </div>`;
    }).join('');
  },

  searchStores: () => {
    const q = document.getElementById('store-search')?.value.toLowerCase()||'';
    document.querySelectorAll('#stores-list .card').forEach(c => {
      const name = c.querySelector('h4')?.innerText.toLowerCase()||'';
      c.style.display = name.includes(q) ? '' : 'none';
    });
  },

  openStore: async (storeId, storeName) => {
    const { data: products } = await App.db.from('products')
      .select('*')
      .eq('store_id', storeId);

    showCustomAlert(`🛒 ${storeName}`, `
      <div style="max-height:300px;overflow-y:auto;margin-bottom:10px;">
        ${products?.map(p => {
          const isOutOfStock = p.status === 'نفذت الكمية';
          return `
          <div style="display:flex;gap:10px;padding:10px;border-bottom:1px solid #eee;align-items:center;opacity:${isOutOfStock?0.6:1}">
            <img src="${p.image_url||'https://via.placeholder.com/60'}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;">
            <div style="flex:1;">
              <strong>${p.name}</strong>
              <p style="color:var(--primary);font-weight:600;margin:3px 0;">${p.price} د.ع</p>
              <small style="color:var(--text-muted);">${p.category||''}</small>
            </div>
            ${isOutOfStock 
              ? '<span style="background:#fff7ed;color:#ea580c;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;">نفذت الكمية ❌</span>' 
              : `<button onclick="Shopping.addToCart('${storeId}','${storeName}','${p.id}','${p.name}',${p.price})" style="padding:6px 12px;background:var(--p);color:white;border:none;border-radius:8px;cursor:pointer;">➕</button>`}
          </div>`;
        }).join('') || '<p class="text-center">لا توجد منتجات</p>'}
      </div>
      <button onclick="Shopping.showFullCart()" style="width:100%;padding:10px;background:#f59e0b;color:white;border:none;border-radius:8px;cursor:pointer;margin-bottom:8px;">
        🛒 عرض السلة (${App.cart?.length||0} صنف)
      </button>
      <button onclick="document.getElementById('global-modal')?.classList.add('hidden')" style="width:100%;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;">إغلاق</button>
    `, null, null);
  },

  addToCart: (storeId, storeName, id, name, price) => {
    if (!App.cart) App.cart = [];
    const item = App.cart.find(i => i.id === id && i.storeId === storeId);
    if (item) {
      item.qty++;
    } else {
      App.cart.push({ storeId, storeName, id, name, price, qty: 1 });
    }
    Notifications.show('✅ تمت الإضافة', name, 'success');
  },

  showFullCart: () => {
    if (!App.cart?.length) return alert('🛒 السلة فارغة');

    const grouped = {};
    App.cart.forEach(item => {
      if (!grouped[item.storeId]) {
        grouped[item.storeId] = { name: item.storeName, items: [], total: 0 };
      }
      grouped[item.storeId].items.push(item);
      grouped[item.storeId].total += item.price * item.qty;
    });

    let html = `<div style="max-height:400px;overflow-y:auto;">`;
    let grandTotal = 0;

    for (const sid in grouped) {
      const store = grouped[sid];
      grandTotal += store.total;
      html += `
        <div style="background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:10px;">
          <h4 style="margin:0 0 8px;border-bottom:1px solid #ddd;padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;">
            📦 ${store.name}
            <span style="color:var(--primary);font-size:13px;">${store.total.toLocaleString()} د.ع</span>
          </h4>
          ${store.items.map(item => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:14px;">
              <span>${item.name} × <input type="number" value="${item.qty}" min="1" max="99" style="width:45px;padding:2px;text-align:center;border:1px solid #ddd;border-radius:4px;" onchange="Shopping.updateQty('${item.id}','${item.storeId}',this.value)"></span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:bold;">${(item.price * item.qty).toLocaleString()} د.ع</span>
                <button onclick="Shopping.removeFromCart('${item.id}','${item.storeId}')" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px;">🗑️</button>
              </div>
            </div>`).join('')}
        </div>`;
    }

    html += `</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:15px;padding-top:10px;border-top:2px solid var(--p);">
        <strong style="font-size:1.1rem;">💰 الإجمالي الكلي:</strong>
        <strong style="font-size:1.2rem;color:var(--primary);">${grandTotal.toLocaleString()} د.ع</strong>
      </div>
      <button onclick="Shopping.checkoutMultiStore()" style="width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">
        ✅ إتمام الشراء من جميع المتاجر - دفع كاش
      </button>
      <button onclick="document.getElementById('global-modal')?.classList.add('hidden')" style="width:100%;margin-top:8px;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;cursor:pointer;">متابعة التسوق</button>`;

    showCustomAlert('🛒 سلة المشتريات', html, null, null);
  },

  updateQty: (itemId, storeId, newQty) => {
    const qty = parseInt(newQty);
    if (!qty || qty < 1) return;
    const item = App.cart.find(i => i.id === itemId && i.storeId === storeId);
    if (item) {
      item.qty = qty;
      Shopping.showFullCart();
    }
  },

  removeFromCart: (itemId, storeId) => {
    App.cart = App.cart.filter(i => !(i.id === itemId && i.storeId === storeId));
    if (App.cart.length === 0) {
      document.getElementById('global-modal')?.classList.add('hidden');
      return alert('🗑️ السلة فارغة الآن');
    }
    Shopping.showFullCart();
  },

  checkoutMultiStore: async () => {
    if (!App.cart?.length) return;
    if (!App.userLocation) { await App.checkGPS(); }

    const grouped = {};
    App.cart.forEach(item => {
      if (!grouped[item.storeId]) {
        grouped[item.storeId] = { items: [], total: 0 };
      }
      grouped[item.storeId].items.push(item);
      grouped[item.storeId].total += item.price * item.qty;
    });

    const totalAmount = App.cart.reduce((s,i) => s + i.price*i.qty, 0);
    const storeCount = Object.keys(grouped).length;

    if (!confirm(`✅ تأكيد الطلب من ${storeCount} متجر\n💵 الدفع النقدي عند الاستلام\n💰 الإجمالي: ${totalAmount.toLocaleString()} د.ع`)) return;

    let success = 0;
    for (const sid in grouped) {
      const store = grouped[sid];
      
      const { data: orderData, error } = await App.db.from('orders').insert({
        store_id: sid,
        customer_id: App.user.id,
        total_price: store.total,
        payment_method: 'cash',
        payment_status: 'غير مدفوع',
        delivery_address: 'عنوان من الخريطة',
        delivery_lat: App.userLocation?.lat,
        delivery_lng: App.userLocation?.lng,
        status: 'جديد'
      }).select();

      if (error) {
        alert('❌ فشل إنشاء طلب لـ ' + store.items[0].storeName);
        continue;
      }

      const orderId = orderData[0].id;

      const itemsToInsert = store.items.map(it => ({
        order_id: orderId,
        product_id: it.id,
        product_name: it.name,
        quantity: it.qty,
        unit_price: it.price,
        subtotal: it.price * it.qty
      }));

      await App.db.from('order_items').insert(itemsToInsert);
      success++;
    }

    App.cart = [];

    alert(`✅ تم إرسال ${success} طلب بنجاح!\n💵 الدفع نقداً عند الاستلام`);
    document.getElementById('global-modal')?.classList.add('hidden');
    App.router('my-orders');
  }
};

// ==========================================
// ⭐ Rating Module
// ==========================================
const Rating = {
  renderStars: (avg) => { 
    const full = Math.floor(avg); 
    const half = avg % 1 >= 0.5; 
    let h = ''; 
    for(let i = 0; i < 5; i++) { 
      if (i < full) h += '⭐'; 
      else if (i === full && half) h += '🌟'; 
      else h += '☆'; 
    } 
    return h; 
  },
  
  openModal: (tripId, revieweeId) => {
    showCustomAlert('⭐ تقييم الرحلة', `
      <div style="text-align:center;">
        <div style="font-size:2rem;margin:10px 0;" id="star-display">☆☆☆☆☆</div>
        <input type="range" id="rating-value" min="1" max="5" value="5" style="width:100%;" oninput="document.getElementById('star-display').innerText = Rating.renderStars(this.value)">
        <textarea id="rating-comment" placeholder="تعليقك (اختياري)" rows="3" style="width:100%;margin-top:15px;padding:10px;border:1px solid #ddd;border-radius:8px;"></textarea>
      </div>
    `, () => Rating.submit(tripId, revieweeId));
  },
  
  submit: async (tripId, revieweeId) => {
    const rating = parseInt(document.getElementById('rating-value')?.value||'5');
    const comment = document.getElementById('rating-comment')?.value.trim()||'';
    const { data: existing } = await App.db.from('reviews').select('id').eq('trip_id',tripId).single();
    if (existing) return alert('✅ لقد قيّمت هذه الرحلة مسبقاً');
    const { error } = await App.db.from('reviews').insert({ trip_id:tripId, reviewer_id:App.user?.id, reviewee_id:revieweeId, rating, comment:comment||null });
    if (error) return alert('❌ فشل التقييم: '+error.message);
    await Rating.updateAverage(revieweeId);
    alert('✅ شكراً لتقييمك!');
  },
  
  updateAverage: async (userId) => {
    const { data } = await App.db.from('reviews').select('rating').eq('reviewee_id',userId);
    if (!data?.length) return;
    const avg = data.reduce((a,r)=>a+r.rating,0)/data.length;
    await App.db.from('profiles').update({ avg_rating:parseFloat(avg.toFixed(2)), rating_count:data.length }).eq('id',userId);
  }
};

// ==========================================
// 💬 Messages Module
// ==========================================
const Messages = {
  openChatModal: () => {
    const modal=document.getElementById('global-modal'), body=document.getElementById('modal-body');
    if (!modal||!body) return;
    body.innerHTML = `<h3 style="text-align:center;margin-bottom:15px;">💬 مراسلة الإدارة</h3>
      <div id="chat-messages" style="max-height:300px;overflow-y:auto;margin-bottom:15px;padding:10px;background:#f8fafc;border-radius:12px;"></div>
      <div style="display:flex;gap:10px;"><input type="text" id="chat-input" class="input-field" placeholder="اكتب رسالتك..." style="flex:1;"><button onclick="Messages.send()" class="btn btn-primary" style="width:auto;padding:12px 20px;">إرسال</button></div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center;">⏳ تُحفظ الرسائل لمدة 24 ساعة فقط</p>`;
    modal.classList.remove('hidden'); Messages.fetch();
  },
  fetch: async () => {
    const container = document.getElementById('chat-messages'); if (!container) return;
    container.innerHTML = '<div class="text-center" style="color:var(--text-muted);">جاري التحميل...</div>';
    const { data } = await App.db.from('messages').select('*').or(`sender_id.eq.${App.user?.id},receiver_id.eq.${App.user?.id}`).gte('created_at',new Date(Date.now()-24*60*60*1000).toISOString()).order('created_at',{ascending:true});
    if (!data?.length) { container.innerHTML='<div class="text-center" style="color:var(--text-muted);">لا توجد رسائل</div>'; return; }
    container.innerHTML = data.map(m=>{const sent=m.sender_id===App.user?.id,t=new Date(m.created_at).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'});return `<div class="message-bubble ${sent?'msg-sent':'msg-received'} ${!m.is_read&&!sent?'msg-unread':''}">${m.content}<span class="msg-status">${t}${!m.is_read&&!sent?' • 🟡 جديد':''}</span></div>`}).join('');
    container.scrollTop=container.scrollHeight;
    const unread=data.filter(m=>!m.is_read&&m.receiver_id===App.user?.id).map(m=>m.id);
    if (unread.length) await App.db.from('messages').update({is_read:true}).in('id',unread);
  },
  send: async () => {
    const input=document.getElementById('chat-input'), content=input?.value.trim(); if (!content) return;
    const { error } = await App.db.from('messages').insert({ sender_id:App.user?.id, receiver_id:CONFIG.ADMIN_USER_ID||App.user?.id, content, is_read:false });
    if (error) return alert('❌ فشل الإرسال: '+error.message); input.value=''; Messages.fetch();
  }
};

// ==========================================
// ℹ️ AboutShira Module
// ==========================================
const AboutShira = {
  showModal: () => {
    const modal=document.getElementById('global-modal'), body=document.getElementById('modal-body'); if (!modal||!body) return;
    body.innerHTML = `<div style="text-align:center;">
      <div style="font-size:3rem;margin-bottom:10px;">🚀</div><h2 style="margin-bottom:10px;">شراع | Shira Platform</h2>
      <p style="color:var(--text-muted);margin-bottom:20px;">منصتك الذكية للنقل والتوصيل في العراق</p>
      <div style="background:#f8fafc;padding:15px;border-radius:12px;margin-bottom:20px;text-align:right;">
        <p><strong>📱 الإصدار:</strong> ${CONFIG.APP_VERSION}</p><p><strong>🏢 الشركة:</strong> شراع للخدمات اللوجستية</p>
        <p><strong>📍 المقر:</strong> بغداد، العراق</p><p><strong>📧 الدعم:</strong> support@shira.app</p>
        <p style="color:#16a34a;font-weight:600;">💵 جميع التعاملات: دفع نقدي (كاش)</p>
      </div>
      <button onclick="Utils.openWhatsApp()" class="btn btn-outline" style="margin-bottom:10px;"><i class="fab fa-whatsapp"></i> تواصل عبر واتساب</button>
      <button onclick="Messages.openChatModal()" class="btn btn-secondary"><i class="fas fa-comment"></i> مراسلة داخل التطبيق</button>
    </div>`; modal.classList.remove('hidden');
  }
};

// ==========================================
// 🛠️ Utils Module
// ==========================================
const Utils = {
  compressImage: async (file, maxWidth, quality) => new Promise((resolve)=>{
    const reader = new FileReader(); 
    reader.readAsDataURL(file);
    reader.onload = (e) => { 
      const img = new Image(); 
      img.src = e.target.result;
      img.onload = () => { 
        const canvas = document.createElement('canvas'); 
        let w = img.width, h = img.height;
        if (w > maxWidth) { 
          h = (maxWidth / w) * h; 
          w = maxWidth; 
        }
        canvas.width = w; 
        canvas.height = h; 
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality); 
      }; 
    };
  }),
  openWhatsApp: () => window.open('https://wa.me/9647722507019','_blank'),
  openInAppChat: () => Messages.openChatModal(),
  showSkeleton: (sel) => { 
    const el = document.querySelector(sel); 
    if (!el) return;
    el.innerHTML = '<div class="skeleton" style="height:20px;width:80%;margin:10px auto;"></div><div class="skeleton" style="height:20px;width:60%;margin:10px auto;"></div><div class="skeleton" style="height:100px;width:100%;margin:10px auto;border-radius:12px;"></div><div class="skeleton" style="height:20px;width:90%;margin:10px auto;"></div>';
  },
  hideSkeleton: (sel) => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = '';
  }
};

// ==========================================
// 🎨 Custom Alert
// ==========================================
const showCustomAlert = (title, message, onConfirm, onCancel) => {
  const hasCancel = typeof onCancel === 'function';
  const modal = document.createElement('div');
  modal.className = 'custom-alert-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;animation:fadeIn 0.3s ease;';
  modal.innerHTML = `<div style="background:white;border-radius:20px;padding:30px 25px;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.4s ease;">
    <div style="width:70px;height:70px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:35px;">${hasCancel ? '⚠️' : '✅'}</div>
    <h3 style="margin:0 0 10px;color:#1e293b;font-size:22px;font-weight:700;">${title}</h3>
    <p style="margin:0 0 25px;color:#64748b;font-size:15px;line-height:1.6;white-space:pre-line;">${message}</p>
    <div style="display:grid;grid-template-columns:${hasCancel ? '1fr 1fr' : '1fr'};gap:10px;">
      <button onclick="this.closest('.custom-alert-overlay').remove();${onConfirm ? 'onConfirm()' : ''}" style="padding:14px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">${hasCancel ? 'حسنًا' : 'إغلاق'}</button>
      ${hasCancel ? `<button onclick="this.closest('.custom-alert-overlay').remove();if(typeof onCancel==='function')onCancel()" style="padding:14px;background:#e2e8f0;color:#475569;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">إلغاء</button>` : ''}
    </div></div>`;
  document.body.appendChild(modal);
  const style = document.createElement('style');
  style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}';
  document.head.appendChild(style);
};

// ==========================================
// 🔔 Notifications Module
// ==========================================
const Notifications = {
  audioCtx: null, toastContainer: null, enabled: true,
  init: () => {
    try { Notifications.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { console.warn('🔇 Web Audio غير مدعوم'); }
    if (!document.getElementById('toast-container')) {
      Notifications.toastContainer = document.createElement('div');
      Notifications.toastContainer.id = 'toast-container';
      Notifications.toastContainer.style.cssText = 'position:fixed;top:80px;right:20px;z-index:10001;display:flex;flex-direction:column;gap:10px;max-width:320px;pointer-events:none;';
      document.body.appendChild(Notifications.toastContainer);
    } else {
      Notifications.toastContainer = document.getElementById('toast-container');
    }
    const saved = localStorage.getItem('notifications_enabled');
    if (saved !== null) Notifications.enabled = saved === 'true';
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  },
  playTone: () => {
    if (!Notifications.enabled || !Notifications.audioCtx) return;
    try {
      if (Notifications.audioCtx.state === 'suspended') Notifications.audioCtx.resume();
      const osc = Notifications.audioCtx.createOscillator();
      const gain = Notifications.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(Notifications.audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, Notifications.audioCtx.currentTime);
      osc.frequency.setValueAtTime(1100, Notifications.audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.4, Notifications.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, Notifications.audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(Notifications.audioCtx.currentTime + 0.25);
    } catch(e) {}
  },
  show: (title, message, type = 'info', onClick = null) => {
    if (!Notifications.enabled) return;
    Notifications.playTone();
    Notifications.showToast(title, message, type, onClick);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/icon-192.png', badge: '/icon-192.png', tag: `shira-${Date.now()}`, requireInteraction: true });
    }
  },
  showToast: (title, message, type, onClick) => {
    const colors = { info: { bg: '#3b82f6', icon: '🔔' }, success: { bg: '#22c55e', icon: '✅' }, warning: { bg: '#f59e0b', icon: '⚠️' }, error: { bg: '#ef4444', icon: '❌' }, trip: { bg: '#8b5cf6', icon: '🚗' }, order: { bg: '#ec4899', icon: '📦' } };
    const style = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.style.cssText = `background:white;border-radius:12px;padding:15px;box-shadow:0 10px 40px rgba(0,0,0,0.2);border-right:4px solid ${style.bg};display:flex;align-items:flex-start;gap:12px;animation:slideIn 0.3s ease;pointer-events:auto;cursor:${onClick ? 'pointer' : 'default'};`;
    toast.innerHTML = `<div style="font-size:24px;flex-shrink:0;">${style.icon}</div><div style="flex:1;min-width:0;"><div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${title}</div><div style="font-size:14px;color:#64748b;line-height:1.4;">${message}</div></div><button onclick="this.closest('.notification-toast').remove()" style="background:none;border:none;font-size:20px;color:#94a3b8;cursor:pointer;padding:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">&times;</button>`;
    if (onClick) {
      toast.onclick = (e) => { if (!e.target.closest('button')) { toast.remove(); onClick(); } };
    }
    Notifications.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 8000);
  },
  toggle: () => { Notifications.enabled = !Notifications.enabled; localStorage.setItem('notifications_enabled', Notifications.enabled); return Notifications.enabled; },
  subscribeToUpdates: () => {
    if (!App.user?.id) return;
    App.db.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${App.user.id}` }, (p) => {
      if (p.new.sender_id !== App.user.id) Notifications.show('💬 رسالة جديدة', 'لديك رسالة جديدة من الإدارة', 'info', () => App.router('profile'));
    }).subscribe();
    if (App.profile && ['سائق تكسي', 'سائق توك توك', 'دلفري'].includes(App.profile.role)) {
      App.db.channel('trips').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips', filter: 'status=eq.قيد الانتظار' }, () => {
        Notifications.show('🚀 طلب جديد!', 'اضغط لعرض تفاصيل الطلب 💵 كاش', 'trip', () => App.router('dashboard'));
      }).subscribe();
    }
    if (App.profile && App.profile.role === 'صاحب متجر') {
      App.db.channel('orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${App.user.id}` }, () => {
        Notifications.show('📦 طلب جديد في متجرك!', 'اضغط لمراجعة الطلب 💵 دفع عند الاستلام', 'order', () => App.router('dashboard'));
      }).subscribe();
    }
  }
};

// ✅ Animations
if (!document.getElementById('notif-anim-style')) {
  const s = document.createElement('style');
  s.id = 'notif-anim-style';
  s.textContent = '@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100px);opacity:0}}';
  document.head.appendChild(s);
}

// ==========================================
// 🚀 Final Init
// ==========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { App.init(); if (App.user) { Notifications.init(); Notifications.subscribeToUpdates(); } });
} else {
  App.init(); if (App.user) { Notifications.init(); Notifications.subscribeToUpdates(); }
}
