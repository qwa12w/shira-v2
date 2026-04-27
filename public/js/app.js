// ==========================================
// شراع | Shira Platform - Core Application Engine v4.1.1
// ✅ التصحيح العاجل: إصلاح أخطاء Destructuring في التسجيل ورفع الصور
// ⚠️ ملاحظة: السائقون يستلمون طلبات تلقائياً، المتاجر تتحكم يدوياً
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
  subscriptionTimer: null,

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
    
    const isAuth = ['login', 'register', 'role-select'].includes(route);
    
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
        case 'shopping': container.innerHTML = Views.shopping(); if (headerTitle) headerTitle.innerText = 'التسوق'; break;
        case 'profile': container.innerHTML = Views.profile(); if (headerTitle) headerTitle.innerText = 'الملف الشخصي'; break;
        case 'my-orders': container.innerHTML = Views.myOrders(); if (headerTitle) headerTitle.innerText = 'طلباتي'; break;
        case 'store-products': container.innerHTML = Views.storeProducts(); if (headerTitle) headerTitle.innerText = 'إدارة المنتجات'; break;
        case 'delivery-map': container.innerHTML = Views.deliveryMap(); if (headerTitle) headerTitle.innerText = 'خريطة التوصيل'; break;
        // ✅ إضافات جديدة لإدارة المتاجر والمنتجات للمدير
        case 'admin-stores': container.innerHTML = Views.adminStores(); if (headerTitle) headerTitle.innerText = 'إدارة المتاجر'; break;
        case 'admin-store-products': container.innerHTML = Views.adminStoreProducts(payload); if (headerTitle) headerTitle.innerText = 'إدارة المنتجات'; break;
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
// 🎨 Views Module - واجهات مخصصة لكل دور
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
    if (!App.profile) return '<div class="text-center mt-2">جاري التحميل...</div>';
    
    const role = App.profile.role;
    
    // ✅ واجهة الزبون فقط
    if (role === 'زبون') {
      return `<div class="card" onclick="App.router('request-ride', 'تاكسي')"><div class="icon">🚗</div><h3>طلب تاكسي</h3></div>` +
        `<div class="card" onclick="App.router('request-ride', 'توك توك')"><div class="icon">🛺</div><h3>طلب توك توك</h3></div>` +
        `<div class="card" onclick="App.router('shopping')"><div class="icon">🛒</div><h3>تسوق</h3></div>` +
        `<div class="card" onclick="App.router('my-orders')"><div class="icon">📦</div><h3>طلباتي</h3></div>`;
    }
    
    // ✅ توجيه الأدوار الأخرى للوحة التحكم
    return Views.dashboard();
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
    const subscriptionEnds = App.profile.subscription_ends_at;
    
    // ✅ واجهة السائقين (تكسي/توك توك/دلفري) - استقبال تلقائي للطلبات (بدون أزرار)
    if (['سائق تكسي', 'سائق توك توك', 'دلفري'].includes(role)) {
      const earnings = App.profile.earnings_today || 0;
      
      if (subscriptionEnds) {
        setTimeout(() => App.startSubscriptionTimer(subscriptionEnds), 100);
      }
      
      return `
        <div class="card glass-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h3>👋 ${name}</h3>
            <span class="badge" style="background:var(--accent); color:white; padding:4px 10px; border-radius:20px; font-size:12px;">${role}</span>
          </div>
          
          <div class="form-group" style="background:#dcfce7; padding:12px; border-radius:12px; margin-bottom:15px; border:2px solid #22c55e;">
            <label style="font-weight:600; color:#166534;">🟢 أنت نشط حالياً</label>
            <p style="font-size:13px; color:#166534; margin:5px 0 0;">
              ستستلم طلبات جديدة بشكل مستمر حتى انتهاء اشتراكك
            </p>
          </div>
          
          ${subscriptionEnds ? `
          <div class="form-group" style="background:#fff3cd; padding:12px; border-radius:12px; margin-bottom:15px;">
            <label style="font-weight:600;">⏰ الوقت المتبقي للاشتراك:</label>
            <div id="subscription-timer" style="font-size:1.2rem; font-weight:bold; margin-top:5px;">جاري الحساب...</div>
            <small style="color:var(--text-muted);">بعد الانتهاء سيتوقف استلام الطلبات تلقائياً</small>
          </div>` : ''}
          
          <div class="card" style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>💰 أرباح اليوم</span>
              <strong style="font-size:1.3rem; color:var(--primary);">${earnings.toLocaleString()} د.ع</strong>
            </div>
          </div>
        </div>
        
        ${role === 'دلفري' ? `
        <div class="card" onclick="App.router('delivery-map')">
          <div class="icon">🔥</div>
          <h3>خريطة المناطق الساخنة</h3>
          <p style="color:var(--text-muted); font-size:13px;">🔴 عالية الطلب • 🟢 منخفضة الطلب</p>
        </div>` : `
        <div class="card" onclick="Driver.fetchNearbyTrips()">
          <div class="icon">📍</div>
          <h3>الرحلات القريبة</h3>
          <p style="color:var(--text-muted); font-size:13px;">اضغط لعرض الطلبات القريبة منك</p>
        </div>`}
        
        <div class="card" onclick="App.router('profile')">
          <div class="icon">📊</div>
          <h3>إحصائياتي</h3>
        </div>
        <div class="card" onclick="App.router('my-orders')">
          <div class="icon">📋</div>
          <h3>سجل الرحلات</h3>
        </div>
      `;
    }
    
    // ✅ واجهة صاحب المتجر - مع أزرار تحكم يدوي (مفتوح/مغلق)
    if (role === 'صاحب متجر') {
      const salesToday = App.profile.sales_today || 0;
      const storeStatus = App.profile.store_status || 'مغلق';
      
      return `
        <div class="card glass-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h3>👋 ${name}</h3>
            <span class="badge" style="background:var(--accent); color:white; padding:4px 10px; border-radius:20px; font-size:12px;">${role}</span>
          </div>
          
          <div class="form-group" style="background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:15px;">
            <label style="font-weight:600;">🏪 حالة المتجر:</label>
            <div style="display:flex; gap:10px; margin-top:8px;">
              <button onclick="Store.toggleStatus('مفتوح')" class="btn ${storeStatus === 'مفتوح' ? 'btn-primary' : 'btn-outline'}" style="flex:1; padding:10px;">🟢 مفتوح</button>
              <button onclick="Store.toggleStatus('مغلق')" class="btn ${storeStatus === 'مغلق' ? 'btn-danger' : 'btn-outline'}" style="flex:1; padding:10px;">🔴 مغلق</button>
            </div>
            <p style="font-size:13px; color:var(--text-muted); margin-top:8px;">
              ${storeStatus === 'مفتوح' ? 'متجرك يستقبل طلبات جديدة الآن' : 'متجرك لا يستقبل طلبات جديدة حالياً'}
            </p>
          </div>
          
          <div class="card" style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>📊 مبيعات اليوم</span>
              <strong style="font-size:1.3rem; color:var(--primary);">${salesToday.toLocaleString()} د.ع</strong>
            </div>
          </div>
        </div>
        
        <div class="card" onclick="App.router('store-products')">
          <div class="icon">📦</div>
          <h3>إدارة المنتجات</h3>
          <p style="color:var(--text-muted); font-size:13px;">إضافة/تعديل/حذف المنتجات</p>
        </div>
        <div class="card" onclick="Store.fetchNewOrders()">
          <div class="icon">🔔</div>
          <h3>الطلبات الجديدة</h3>
          <p style="color:var(--text-muted); font-size:13px;">استقبال ومتابعة الطلبات</p>
        </div>
        <div class="card" onclick="Store.trackDeliveries()">
          <div class="icon">🚚</div>
          <h3>متابعة التوصيل</h3>
          <p style="color:var(--text-muted); font-size:13px;">حالة طلبات التوصيل</p>
        </div>
        <div class="card" onclick="App.router('profile')">
          <div class="icon">📈</div>
          <h3>الإحصائيات</h3>
        </div>
      `;
    }
    
    // ✅ واجهة المدير
    if (role === 'admin') {
      return `
        <div class="card glass-panel">
          <h3>👋 لوحة تحكم المدير</h3>
          <p style="color:var(--text-muted);">إدارة شاملة للتطبيق</p>
        </div>
        <div class="card"><div class="icon">👥</div><h3>المستخدمين</h3></div>
        <div class="card"><div class="icon">🚗</div><h3>السائقين</h3></div>
        <div class="card" onclick="App.router('admin-stores')"><div class="icon">🏪</div><h3>إدارة المتاجر</h3><p style="color:var(--text-muted); font-size:13px;">تعديل المنتجات، التحكم في الحالة</p></div>
        <div class="card"><div class="icon">📈</div><h3>الإحصائيات</h3></div>
        <div class="card"><div class="icon">⚙️</div><h3>الإعدادات</h3></div>
      `;
    }
    
    // ✅ الواجهة الافتراضية
    return `<div class="card"><h3>👋 ${name}</h3><p>الدور: <span class="badge" style="background:var(--accent); color:white; padding:4px 10px; border-radius:20px; font-size:12px;">${role}</span></p></div>` +
      `<div class="card" onclick="App.router('profile')"><div class="icon">📊</div><h3>الملف الشخصي</h3></div>`;
  },
  
  myOrders: () => {
    return `<div class="text-center" style="padding:40px 20px;">
      <div style="font-size:60px; margin-bottom:20px;">📦</div>
      <h2>طلباتي</h2>
      <p style="color:var(--text-muted); margin-bottom:30px;">سجل جميع طلباتك السابقة والحالية</p>
      <button onclick="App.router('home')" class="btn btn-outline">العودة</button>
    </div>`;
  },
  
  storeProducts: () => {
    return `<div class="text-center" style="padding:40px 20px;">
      <div style="font-size:60px; margin-bottom:20px;">📦</div>
      <h2>إدارة المنتجات</h2>
      <p style="color:var(--text-muted); margin-bottom:30px;">إضافة، تعديل، وحذف المنتجات</p>
      <button class="btn btn-primary" style="margin-bottom:20px;">➕ إضافة منتج جديد</button>
      <div class="card" style="margin-bottom:10px; text-align:right;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>منتج مثال</strong>
            <p style="color:var(--text-muted); font-size:13px; margin:5px 0;">السعر: 5,000 د.ع</p>
          </div>
          <span class="badge" style="background:var(--green); color:white; padding:4px 10px; border-radius:20px; font-size:12px;">✅ متوفر</span>
        </div>
      </div>
      <button onclick="App.router('dashboard')" class="btn btn-outline">العودة</button>
    </div>`;
  },
  
  deliveryMap: () => {
    return `<div class="map-wrapper" style="height:400px; border-radius:12px; overflow:hidden; margin-bottom:16px;"><div id="map" style="height:100%;"></div></div>
      <div style="background:#f8fafc; padding:15px; border-radius:12px; margin-bottom:15px;">
        <h4 style="margin-bottom:10px;">🔥 خريطة المناطق الساخنة</h4>
        <div style="display:flex; gap:10px; font-size:13px;">
          <span style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#ef4444; border-radius:50%;"></span> طلبات كثيرة</span>
          <span style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:#22c55e; border-radius:50%;"></span> طلبات قليلة</span>
        </div>
      </div>
      <button onclick="App.router('dashboard')" class="btn btn-outline">العودة</button>`;
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
    
    const bottomNavInProfile = `
      <div class="profile-bottom-nav" style="
        position: fixed; bottom: 0; left: 0; right: 0;
        background: linear-gradient(to bottom, rgba(255,255,255,0.98), rgba(255,255,255,0.95));
        backdrop-filter: blur(10px);
        padding: 10px 5px;
        display: flex; justify-content: space-around; align-items: center;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
        z-index: 999; border-top: 1px solid #f1f5f9;
      ">
        <button onclick="App.router('home')" style="
          flex: 1; text-align: center; padding: 8px 5px;
          background: none; border: none; cursor: pointer;
          font-size: 0.75rem; display: flex;
          flex-direction: column; align-items: center; gap: 4px;
          color: #64748b; transition: all 0.2s;
        " onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#64748b'">
          <span style="font-size: 1.3rem;">🏠</span>
          <span>الرئيسية</span>
        </button>
        <button onclick="App.router('my-orders')" style="
          flex: 1; text-align: center; padding: 8px 5px;
          background: none; border: none; cursor: pointer;
          font-size: 0.75rem; display: flex;
          flex-direction: column; align-items: center; gap: 4px;
          color: #64748b; transition: all 0.2s;
        " onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#64748b'">
          <span style="font-size: 1.3rem;">📦</span>
          <span>طلباتي</span>
        </button>
        <button onclick="App.router('chat')" style="
          flex: 1; text-align: center; padding: 8px 5px;
          background: none; border: none; cursor: pointer;
          font-size: 0.75rem; display: flex;
          flex-direction: column; align-items: center; gap: 4px;
          color: #64748b; transition: all 0.2s;
        " onmouseover="this.style.color='#f59e0b'" onmouseout="this.style.color='#64748b'">
          <span style="font-size: 1.3rem;">💬</span>
          <span>الرسائل</span>
        </button>
        <button onclick="App.router('profile')" style="
          flex: 1; text-align: center; padding: 8px 5px;
          background: rgba(245, 158, 11, 0.1);
          border: none; cursor: pointer;
          font-size: 0.75rem; display: flex;
          flex-direction: column; align-items: center; gap: 4px;
          color: #f59e0b; border-radius: 12px;
        ">
          <span style="font-size: 1.3rem;">👤</span>
          <span>الملف</span>
        </button>
      </div>
    `;
    
    return `
      <div class="text-center mb-2" style="padding-top: 20px;">
        <img src="${avatarUrl}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary)" onerror="this.src='${fallbackSvg}'">
        <h2 class="mt-2">${name}</h2>
        <p style="color:var(--text-muted);">${phone}</p>
        <p style="color: var(--primary); font-size: 14px; margin-top: 5px; font-weight:600;">${role}</p>
      </div>
      ${ratingSection}
      <button onclick="Profile.edit()" class="btn btn-primary mb-2">✏️ تعديل الملف الشخصي</button>
      <button onclick="App.secureLogout()" class="btn btn-danger">🚪 خروج آمن</button>
      ${supportSection}
      ${bottomNavInProfile}
    `;
  },
  
  // ✅ إضافات جديدة لإدارة المتاجر والمنتجات للمدير
  adminStores: () => {
    return `
      <div style="margin-bottom:20px;">
        <input type="text" id="store-search" class="input-field" placeholder="🔍 بحث عن متجر..." style="width:100%; margin-bottom:10px;">
      </div>
      <div id="stores-list" style="display:flex; flex-direction:column; gap:10px;">
        <div class="skeleton" style="height:80px; border-radius:12px;"></div>
        <div class="skeleton" style="height:80px; border-radius:12px;"></div>
      </div>
    `;
  },
  
  adminStoreProducts: (storeId) => {
    return `
      <div style="margin-bottom:15px;">
        <button onclick="App.router('admin-stores')" class="btn btn-outline" style="padding:8px 16px;">↩️ عودة للمتاجر</button>
      </div>
      
      <div class="card glass-panel" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <h3 id="store-name" style="margin:0;">جاري التحميل...</h3>
          <button onclick="Admin.openAddProductModal('${storeId}')" class="btn btn-primary" style="padding:10px 20px;">➕ إضافة منتج</button>
        </div>
      </div>
      
      <div style="margin-bottom:15px; display:flex; gap:10px; flex-wrap:wrap;">
        <input type="text" id="product-search" class="input-field" placeholder="🔍 بحث عن منتج..." style="flex:1; min-width:200px;">
        <select id="product-filter" class="input-field" style="width:auto;">
          <option value="all">كل المنتجات</option>
          <option value="available">✅ متوفر</option>
          <option value="unavailable">❌ منتهي</option>
        </select>
      </div>
      
      <div id="products-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">
        <div class="skeleton" style="height:200px; border-radius:12px;"></div>
        <div class="skeleton" style="height:200px; border-radius:12px;"></div>
      </div>
    `;
  }
};

// ==========================================
// 🔐 Auth Module (✅ تم التصحيح هنا)
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
        // ✅ التصحيح: إضافة 'data:' قبل upData
        const { error: upErr,  upData } = await App.db.storage
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
    
    // ✅ التصحيح الرئيسي: إضافة 'data:' قبل authData
    const {  authData, error: authErr } = await App.db.auth.signUp({
      email: phone + '@shira.app',
      password: pass,
      options: {  { name, phone, role, gender, age: parseInt(age) } }
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
          // ✅ التصحيح: إضافة 'data:' قبل upData
          const { error: upErr,  upData } = await App.db.storage
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
          // ✅ التصحيح: إضافة 'data:' قبل upData
          const { error: upErr,  upData } = await App.db.storage
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
          // ✅ التصحيح: إضافة 'data:' قبل upData
          const { error: upErr,  upData } = await App.db.storage
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
  
  // ✅ دالة خريطة الحرارة للدلفري
  initHeatMap: () => {
    if (App.map) { App.map.remove(); App.map = null; }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    
    App.map = L.map('map').setView(App.userLocation || CONFIG.MAP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(App.map);
    
    // ✅ محاكاة بيانات المناطق الساخنة (يتم استبدالها ببيانات حقيقية من Supabase)
    const heatData = [
      [33.3152, 44.3661, 0.9],
      [33.3200, 44.3700, 0.7],
      [33.3100, 44.3600, 0.8],
      [33.2800, 44.3200, 0.3],
      [33.2900, 44.3300, 0.2],
      [33.3400, 44.3900, 0.6],
    ];
    
    // ✅ عرض دوائر ملونة بدلاً من Heatmap plugin للسهولة
    heatData.forEach(([lat, lng, intensity]) => {
      const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f59e0b' : '#22c55e';
      const radius = intensity * 300;
      L.circle([lat, lng], {
        color: color,
        fillColor: color,
        fillOpacity: 0.3,
        radius: radius
      }).addTo(App.map).bindPopup(`كثافة الطلب: ${Math.round(intensity * 100)}%`);
    });
    
    if (App.userLocation) {
      App.userMarker = L.marker([App.userLocation.lat, App.userLocation.lng]).addTo(App.map).bindPopup('📍 موقعك').openPopup();
    }
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
// 🚗 Driver Module (للسائقين والدلفري) - بدون تحكم يدوي
// ==========================================
const Driver = {
  fetchNearbyTrips: async () => {
    if (!App.userLocation) return alert('⚠️ يرجى تفعيل الموقع أولاً');
    alert('🔍 جاري البحث عن رحلات قريبة...');
    // ✅ هنا يتم إضافة كود جلب الرحلات من Supabase
  }
};

// ==========================================
// 🏪 Store Module (لأصحاب المتاجر) - مع تحكم يدوي
// ==========================================
const Store = {
  toggleStatus: async (status) => {
    if (!App.user?.id) return;
    try {
      await App.db.from('profiles').update({ store_status: status }).eq('id', App.user.id);
      if (App.profile) App.profile.store_status = status;
      App.router('dashboard'); // إعادة تحميل الواجهة
      alert(status === 'مفتوح' ? '🟢 متجرك مفتوح الآن' : '🔴 تم إغلاق المتجر');
    } catch (err) {
      alert('❌ فشل تحديث حالة المتجر: ' + err.message);
    }
  },
  
  fetchNewOrders: async () => {
    alert('🔔 جاري جلب الطلبات الجديدة...');
    // ✅ هنا يتم إضافة كود جلب الطلبات من Supabase
  },
  
  trackDeliveries: async () => {
    alert('🚚 جاري تتبع طلبات التوصيل...');
    // ✅ هنا يتم إضافة كود تتبع التوصيل
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
    // ✅ التصحيح: إضافة 'data:' قبل existing
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
          <p><strong>📱 الإصدار:</strong> 4.1.1</p>
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
// 🎨 دالة النافذة المنبثقة الأنيقة
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
// 🎨 استبدال نوافذ المتصفح الافتراضية
// ==========================================
window.alert = (message) => {
  showCustomAlert('تنبيه', message, null);
};

window.confirm = (message) => {
  return new Promise((resolve) => {
    showCustomAlert('تأكيد', message, () => resolve(true), () => resolve(false));
  });
};

// ==========================================
// 🔔 Notifications Module - إشعارات صوتية ومرئية (يستخدم نغمة النظام تلقائياً في الخلفية)
// ==========================================
const Notifications = {
  audioCtx: null,
  toastContainer: null,
  enabled: true,
  
  init: () => {
    // ✅ تهيئة سياق الصوت البرمجي
    try {
      Notifications.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('🔇 Web Audio غير مدعوم'); }
    
    // ✅ إنشاء حاوية الإشعارات المرئية
    if (!document.getElementById('toast-container')) {
      Notifications.toastContainer = document.createElement('div');
      Notifications.toastContainer.id = 'toast-container';
      Notifications.toastContainer.style.cssText = `
        position: fixed; top: 80px; right: 20px; z-index: 10001;
        display: flex; flex-direction: column; gap: 10px;
        max-width: 320px; pointer-events: none;
      `;
      document.body.appendChild(Notifications.toastContainer);
    } else {
      Notifications.toastContainer = document.getElementById('toast-container');
    }
    
    // ✅ تحميل التفضيل
    const saved = localStorage.getItem('notifications_enabled');
    if (saved !== null) Notifications.enabled = saved === 'true';
    
    // ✅ طلب إذن الإشعارات
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
  
  // ✅ توليد نغمة إشعار قياسية برمجياً (تحاكي صوت النظام)
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
    } catch (e) {}
  },
  
  // ✅ عرض الإشعار الكامل (صوتي + مرئي + نظام)
  show: (title, message, type = 'info', onClick = null) => {
    if (!Notifications.enabled) return;
    Notifications.playTone(); // 🔊 نغمة برمجية عند فتح التطبيق
    Notifications.showToast(title, message, type, onClick);
    
    // 📱 إشعار الخلفية (يستخدم نغمة الهاتف الافتراضية تلقائياً)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `shira-${Date.now()}`,
        requireInteraction: true
      });
    }
  },
  
  showToast: (title, message, type, onClick) => {
    const colors = {
      info: { bg: '#3b82f6', icon: '🔔' }, success: { bg: '#22c55e', icon: '✅' },
      warning: { bg: '#f59e0b', icon: '⚠️' }, error: { bg: '#ef4444', icon: '❌' },
      trip: { bg: '#8b5cf6', icon: '🚗' }, order: { bg: '#ec4899', icon: '📦' }
    };
    const style = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.style.cssText = `
      background: white; border-radius: 12px; padding: 15px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2); border-right: 4px solid ${style.bg};
      display: flex; align-items: flex-start; gap: 12px;
      animation: slideIn 0.3s ease; pointer-events: auto;
      cursor: ${onClick ? 'pointer' : 'default'};
    `;
    toast.innerHTML = `
      <div style="font-size: 24px; flex-shrink: 0;">${style.icon}</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">${title}</div>
        <div style="font-size: 14px; color: #64748b; line-height: 1.4;">${message}</div>
      </div>
      <button onclick="this.closest('.notification-toast').remove()" style="
        background: none; border: none; font-size: 20px; color: #94a3b8;
        cursor: pointer; padding: 0; width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
      ">&times;</button>
    `;
    if (onClick) {
      toast.onclick = (e) => { if (!e.target.closest('button')) { toast.remove(); onClick(); } };
    }
    Notifications.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 8000);
  },
  
  toggle: () => {
    Notifications.enabled = !Notifications.enabled;
    localStorage.setItem('notifications_enabled', Notifications.enabled);
    return Notifications.enabled;
  },
  
  subscribeToUpdates: () => {
    if (!App.user?.id) return;
    
    // 🔔 مراقبة الرسائل الجديدة
    App.db.channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${App.user.id}` }, 
        (payload) => { if (payload.new.sender_id !== App.user.id) Notifications.show('💬 رسالة جديدة', 'لديك رسالة جديدة من الإدارة', 'info', () => App.router('profile')); })
      .subscribe();
      
    // 🔔 مراقبة الطلبات الجديدة (للسائقين)
    if (['سائق تكسي', 'سائق توك توك', 'دلفري'].includes(App.profile?.role)) {
      App.db.channel('trips')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips', filter: `status=eq.قيد الانتظار` },
          () => Notifications.show('🚀 طلب جديد!', 'اضغط لعرض تفاصيل الطلب', 'trip', () => App.router('dashboard')))
        .subscribe();
    }
    
    // 🔔 مراقبة طلبات المتاجر (لأصحاب المتاجر)
    if (App.profile?.role === 'صاحب متجر') {
      App.db.channel('orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${App.user.id}` },
          () => Notifications.show('📦 طلب جديد في متجرك!', 'اضغط لمراجعة الطلب', 'order', () => App.router('dashboard')))
        .subscribe();
    }
  }
};

// ✅ أنيميشن الإشعارات
if (!document.getElementById('notif-anim-style')) {
  const s = document.createElement('style');
  s.id = 'notif-anim-style';
  s.textContent = `@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100px);opacity:0}}`;
  document.head.appendChild(s);
}

// ==========================================
// 👨‍💼 Admin Module - إدارة المتاجر والمنتجات (إضافة جديدة)
// ==========================================
const Admin = {
  
  // جلب قائمة المتاجر
  fetchStores: async () => {
    const { data, error } = await App.db
      .from('profiles')
      .select('id, name, phone, store_type, store_status, created_at')
      .eq('role', 'صاحب متجر')
      .order('created_at', { ascending: false });
    
    if (error) return console.error('❌ Failed to fetch stores:', error);
    
    const container = document.getElementById('stores-list');
    if (!container) return;
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-center" style="color:var(--text-muted); padding:20px;">لا توجد متاجر مسجلة</div>';
      return;
    }
    
    container.innerHTML = data.map(store => `
      <div class="card" style="padding:15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <strong style="font-size:1.1rem;">${store.name || 'بدون اسم'}</strong>
          <p style="color:var(--text-muted); font-size:13px; margin:5px 0;">
            📱 ${store.phone} • 🏪 ${store.store_type || 'غير محدد'}
          </p>
          <span class="badge" style="background:${store.store_status === 'مفتوح' ? '#22c55e' : '#ef4444'}; color:white; padding:4px 10px; border-radius:20px; font-size:12px;">
            ${store.store_status === 'مفتوح' ? '🟢 مفتوح' : '🔴 مغلق'}
          </span>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="Admin.viewStoreProducts('${store.id}', '${store.name}')" class="btn btn-outline" style="padding:8px 16px; font-size:13px;">📦 المنتجات</button>
          <button onclick="Admin.toggleStoreStatus('${store.id}', '${store.store_status}')" class="btn ${store.store_status === 'مفتوح' ? 'btn-danger' : 'btn-primary'}" style="padding:8px 16px; font-size:13px;">
            ${store.store_status === 'مفتوح' ? '🔴 إغلاق' : '🟢 تفعيل'}
          </button>
        </div>
      </div>
    `).join('');
  },
  
  // عرض منتجات متجر معين
  viewStoreProducts: async (storeId, storeName) => {
    const nameEl = document.getElementById('store-name');
    if (nameEl) nameEl.innerText = `🏪 ${storeName}`;
    
    const { data, error } = await App.db
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    
    if (error) return console.error('❌ Failed to fetch products:', error);
    
    const container = document.getElementById('products-list');
    if (!container) return;
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-center" style="color:var(--text-muted); padding:40px;">لا توجد منتجات في هذا المتجر</div>';
      return;
    }
    
    container.innerHTML = data.map(product => `
      <div class="card" style="padding:15px; position:relative;" data-store-id="${storeId}">
        <button onclick="Admin.deleteProduct('${product.id}')" style="position:absolute; top:10px; left:10px; background:#ef4444; color:white; border:none; width:24px; height:24px; border-radius:50%; font-size:14px; cursor:pointer;">&times;</button>
        
        ${product.image_url ? `<img src="${product.image_url}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:10px;">` : ''}
        
        <strong style="font-size:1.1rem;">${product.name}</strong>
        <p style="color:var(--text-muted); font-size:13px; margin:5px 0; min-height:40px;">${product.description || 'بدون وصف'}</p>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          <span style="font-weight:600; color:var(--primary);">${product.price.toLocaleString()} د.ع</span>
          <button onclick="Admin.toggleProductAvailability('${product.id}', ${product.is_available})" 
            class="btn ${product.is_available ? 'btn-outline' : 'btn-primary'}" 
            style="padding:6px 12px; font-size:12px;">
            ${product.is_available ? '✅ متوفر' : '❌ منتهي'}
          </button>
        </div>
      </div>
    `).join('');
    
    // ✅ إضافة فلترة بحث بسيطة
    const searchInput = document.getElementById('product-search');
    const filterSelect = document.getElementById('product-filter');
    
    const applyFilters = () => {
      const query = searchInput?.value.toLowerCase() || '';
      const status = filterSelect?.value || 'all';
      
      document.querySelectorAll('#products-list .card').forEach(card => {
        const name = card.querySelector('strong')?.innerText.toLowerCase() || '';
        const isAvailable = card.querySelector('button[onclick*="toggleProductAvailability"]')?.innerText.includes('متوفر');
        
        const matchesSearch = name.includes(query);
        const matchesStatus = status === 'all' || 
          (status === 'available' && isAvailable) || 
          (status === 'unavailable' && !isAvailable);
        
        card.style.display = matchesSearch && matchesStatus ? 'block' : 'none';
      });
    };
    
    searchInput?.addEventListener('input', applyFilters);
    filterSelect?.addEventListener('change', applyFilters);
  },
  
  // فتح نموذج إضافة منتج
  openAddProductModal: (storeId) => {
    const modal = document.getElementById('global-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    
    body.innerHTML = `
      <h3 style="text-align:center; margin-bottom:20px;">➕ إضافة منتج جديد</h3>
      <form id="add-product-form" style="text-align:right;">
        <div class="form-group">
          <label>اسم المنتج *</label>
          <input type="text" id="prod-name" class="input-field" required>
        </div>
        <div class="form-group">
          <label>الوصف</label>
          <textarea id="prod-desc" class="input-field" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>السعر (د.ع) *</label>
          <input type="number" id="prod-price" class="input-field" min="0" required>
        </div>
        <div class="form-group">
          <label>صورة المنتج</label>
          <input type="file" id="prod-image" class="input-field" accept="image/*">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="prod-available" checked> متاح للبيع
          </label>
        </div>
      </form>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button onclick="Admin.saveProduct('${storeId}')" class="btn btn-primary" style="flex:1;">💾 حفظ المنتج</button>
        <button onclick="document.getElementById('global-modal')?.classList.add('hidden')" class="btn btn-outline" style="flex:1;">إلغاء</button>
      </div>
    `;
    modal.classList.remove('hidden');
  },
  
  // حفظ منتج جديد
  saveProduct: async (storeId) => {
    const name = document.getElementById('prod-name')?.value.trim();
    const description = document.getElementById('prod-desc')?.value.trim();
    const price = parseFloat(document.getElementById('prod-price')?.value);
    const isAvailable = document.getElementById('prod-available')?.checked;
    const imageFile = document.getElementById('prod-image')?.files[0];
    
    if (!name || !price) return alert('⚠️ يرجى إدخال اسم المنتج والسعر');
    
    let imageUrl = null;
    if (imageFile) {
      try {
        const compressed = await Utils.compressImage(imageFile, 800, 0.8);
        const fileName = `products/${storeId}/${Date.now()}_${name.replace(/\s+/g, '_')}.jpg`;
        const { error: upErr,  upData } = await App.db.storage
          .from(CONFIG.STORAGE_BUCKETS.products)
          .upload(fileName, compressed, { upsert: true });
        if (!upErr && upData?.path) {
          imageUrl = App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).getPublicUrl(upData.path).data.publicUrl;
        }
      } catch (e) {
        console.warn('⚠️ فشل رفع الصورة:', e);
      }
    }
    
    const { error } = await App.db.from('products').insert({
      store_id: storeId,
      name,
      description,
      price,
      image_url: imageUrl,
      is_available: isAvailable
    });
    
    if (error) return alert('❌ فشل حفظ المنتج: ' + error.message);
    
    document.getElementById('global-modal')?.classList.add('hidden');
    alert('✅ تم إضافة المنتج بنجاح');
    const storeName = document.getElementById('store-name')?.innerText.replace('🏪 ', '');
    Admin.viewStoreProducts(storeId, storeName);
  },
  
  // تبديل حالة المنتج (متوفر/منتهي)
  toggleProductAvailability: async (productId, currentStatus) => {
    const { error } = await App.db
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', productId);
    
    if (error) return alert('❌ فشل تحديث الحالة: ' + error.message);
    
    // إعادة تحميل القائمة
    const cards = document.querySelectorAll('#products-list .card');
    if (cards[0]) {
      const storeId = cards[0].dataset.storeId;
      const storeName = document.getElementById('store-name')?.innerText.replace('🏪 ', '');
      if (storeId) Admin.viewStoreProducts(storeId, storeName);
    }
  },
  
  // حذف منتج
  deleteProduct: async (productId) => {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المنتج نهائياً؟')) return;
    
    const { error } = await App.db.from('products').delete().eq('id', productId);
    if (error) return alert('❌ فشل حذف المنتج: ' + error.message);
    
    alert('✅ تم حذف المنتج');
    // إعادة تحميل القائمة
    const cards = document.querySelectorAll('#products-list .card');
    if (cards[0]) {
      const storeId = cards[0].dataset.storeId;
      const storeName = document.getElementById('store-name')?.innerText.replace('🏪 ', '');
      if (storeId) Admin.viewStoreProducts(storeId, storeName);
    }
  },
  
  // تبديل حالة المتجر
  toggleStoreStatus: async (storeId, currentStatus) => {
    const newStatus = currentStatus === 'مفتوح' ? 'مغلق' : 'مفتوح';
    const { error } = await App.db
      .from('profiles')
      .update({ store_status: newStatus })
      .eq('id', storeId);
    
    if (error) return alert('❌ فشل تحديث حالة المتجر: ' + error.message);
    
    alert(`✅ تم ${newStatus === 'مفتوح' ? 'تفعيل' : 'إغلاق'} المتجر`);
    Admin.fetchStores();
  }
};

// ==========================================
// 🚀 التهيئة النهائية
// ==========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
    // ✅ تفعيل الإشعارات بعد تهيئة التطبيق
    if (App.user) { Notifications.init(); Notifications.subscribeToUpdates(); }
    
    // ✅ تحميل قائمة المتاجر إذا كنا في صفحة الإدارة
    if (App.currentRoute === 'admin-stores') {
      setTimeout(() => Admin.fetchStores(), 100);
    }
    if (App.currentRoute === 'admin-store-products') {
      setTimeout(() => {
        const storeId = App.router.payload; // قد تحتاج لتعديل هذا حسب طريقة تمرير المعرف
        if (storeId) Admin.viewStoreProducts(storeId, '');
      }, 100);
    }
  });
} else {
  App.init();
  // ✅ تفعيل الإشعارات بعد تهيئة التطبيق
  if (App.user) { Notifications.init(); Notifications.subscribeToUpdates(); }
  
  // ✅ تحميل قائمة المتاجر إذا كنا في صفحة الإدارة
  if (App.currentRoute === 'admin-stores') {
    setTimeout(() => Admin.fetchStores(), 100);
  }
  if (App.currentRoute === 'admin-store-products') {
    setTimeout(() => {
      const storeId = App.router.payload;
      if (storeId) Admin.viewStoreProducts(storeId, '');
    }, 100);
  }
}
