// ==========================================
// شراع - التطبيق الرئيسي (v13.2 - Final Fix)
// ==========================================

const CONFIG = {
  SUPABASE_URL: "https://qioiiidrwqvwzkveoxnm.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpb2lpaWRyd3F2d3prdmVveG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDQzNTUsImV4cCI6MjA5MTc4MDM1NX0.NpsoJx30JBHPxzjup256ad7hg3u5WV4zuj-LpIr-uss"
};

const app = { 
  currentUser: null, 
  db: null,
  map: null, 
  marker: null,
  selectedServiceType: 'تاكسي', 
  userLat: null, 
  userLng: null
};

window.onload = async function() {
  app.db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  const { data: { session } } = await app.db.auth.getSession();
  if (session) {
    app.currentUser = session.user;
    loadUserDashboard();
  } else {
    showScreen('auth-screen');
  }
  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.addEventListener('submit', handleLogin);
};

function showScreen(screenId) {
  document.querySelectorAll('body > div').forEach(el => el.classList.add('hidden'));
  const el = document.getElementById(screenId);
  if (el) el.classList.remove('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('auth-phone').value.trim();
  const pass = document.getElementById('auth-password').value;
  const msg = document.getElementById('auth-msg');
  if (msg) msg.innerText = 'جاري الدخول...';
  
  const { error } = await app.db.auth.signInWithPassword({
    email: phone + '@shira.app',
    password: pass
  });

  if (error) {
    if (msg) { msg.innerText = '❌ خطأ في البيانات'; msg.style.color = 'red'; }
  } else {
    location.reload();
  }
}

async function loadUserDashboard() {
  // ✅ استخدام maybeSingle بدلاً من single
  const { data: profile, error } = await app.db
    .from('profiles')
    .select('*')
    .eq('id', app.currentUser.id)
    .maybeSingle();

  if (error || !profile) {
    console.error('Profile error:', error);
    logout();
    return;
  }

  if (profile.status !== 'نشط') {
    showScreen('pending-screen');
    return;
  }

  if (profile.role === 'زبون') {
    const dash = document.getElementById('dashboard-customer');
    if (dash) dash.classList.remove('hidden');
    const nameEl = document.getElementById('user-name-display');
    if (nameEl) nameEl.innerText = profile.name || 'زبون';
    
    // ✅ تأخير لضمان تحميل DOM
    setTimeout(() => { loadCustomerTrips(); }, 100);
  }
}

// ✅ ربط الدوال بـ window لتكون عامة
window.showTaxiScreen = function() {
  const home = document.getElementById('customer-home-view');
  const taxi = document.getElementById('customer-taxi-view');
  if (home) home.classList.add('hidden');
  if (taxi) taxi.classList.remove('hidden');
  setTimeout(initMap, 100);
}

window.hideTaxiScreen = function() {
  const home = document.getElementById('customer-home-view');
  const taxi = document.getElementById('customer-taxi-view');
  if (taxi) taxi.classList.add('hidden');
  if (home) home.classList.remove('hidden');
  if (app.map) { app.map.remove(); app.map = null; }
}

window.selectVehicle = function(type, element) {
  app.selectedServiceType = type;
  document.querySelectorAll('.vehicle-option').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');
  const price = type === 'توك توك' ? 1500 : 2000;
  const el = document.getElementById('price-val');
  if (el) el.innerText = price;
}

function initMap() {
  if (app.map) return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  
  app.map = L.map('map').setView([30.5085, 47.7835], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(app.map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      app.userLat = pos.coords.latitude;
      app.userLng = pos.coords.longitude;
      app.map.setView([app.userLat, app.userLng], 15);
      app.marker = L.marker([app.userLat, app.userLng]).addTo(app.map).bindPopup('موقعك').openPopup();
    });
  }
}

window.requestTrip = async function() {
  const destEl = document.getElementById('destination');
  if (!destEl || !destEl.value) return alert('الرجاء إدخال الوجهة');
  
  const priceEl = document.getElementById('price-val');
  const price = priceEl ? priceEl.innerText : '2000';
  
  const { error } = await app.db.from('trips').insert({
    customer_id: app.currentUser.id,
    service_type: app.selectedServiceType,
    pickup_lat: app.userLat,
    pickup_lng: app.userLng,
    dropoff_address: destEl.value,
    final_price: price,
    status: 'قيد الانتظار'
  });

  if (error) {
    alert('فشل إرسال الطلب');
  } else {
    alert('✅ تم إرسال طلبك!');
    window.hideTaxiScreen();
    loadCustomerTrips();
  }
}

async function loadCustomerTrips() {
  const list = document.getElementById('customer-trips-list');
  if (!list) return; // ✅ فحص العنصر قبل الاستخدام

  const { data } = await app.db.from('trips')
    .select('*')
    .eq('customer_id', app.currentUser.id)
    .limit(3);
    
  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#aaa">لا توجد رحلات</p>';
    return;
  }

  list.innerHTML = data.map(t => `
    <div style="background:white;padding:15px;border-radius:10px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-weight:bold;">
        <span>${t.service_type}</span>
        <span style="color:#f59e0b">${t.final_price} د.ع</span>
      </div>
      <div style="font-size:12px;color:#666;margin-top:5px">${t.status}</div>
    </div>
  `).join('');
}

window.logout = function() {
  app.db.auth.signOut();
  location.reload();
}
