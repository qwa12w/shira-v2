// ==========================================
// شراع | Shira Platform - Store Module
// إدارة المتاجر، المنتجات، والطلبات
// ==========================================

const Store = {
  init: () => {
    // تسجيل مسارات المتجر في الراوتر الرئيسي
    App.routes['store-dashboard'] = Store.renderDashboard;
    App.routes['store-products'] = Store.renderProducts;
    App.routes['store-orders'] = Store.renderOrders;
    App.routes['store-settings'] = Store.renderSettings;

    // تفعيل الاستماع الفوري للطلبات الجديدة
    Store.subscribeToOrders();
  },

  // 🏪 لوحة التحكم الرئيسية
  renderDashboard: () => `
    <div class="list-item">
      <h3>🏪 متجر: ${App.profile.store_name || 'غير محدد'}</h3>
      <p>الحالة: <span class="badge ${App.profile.store_status === 'مفتوح' ? 'badge-success' : 'badge-danger'}">${App.profile.store_status || 'مغلق'}</span></p>
      <p>إجمالي المبيعات: ${App.profile.total_revenue || 0} د.ع</p>
    </div>
    <div class="role-card" onclick="App.router('store-products')"><div class="icon">📦</div><h3>إدارة المنتجات</h3></div>
    <div class="role-card" onclick="App.router('store-orders')"><div class="icon">📋</div><h3>الطلبات الواردة</h3></div>
    <div class="role-card" onclick="App.router('store-settings')"><div class="icon">⚙️</div><h3>إعدادات المتجر</h3></div>
  `,

  // 📦 عرض وإدارة المنتجات
  renderProducts: async () => {
    const { data } = await App.db.from('products').select('*').eq('store_id', App.user.id).order('created_at', { ascending: false });
    let html = `
      <div class="form-group"><input type="text" id="prod-name" class="input-field" placeholder="اسم المنتج"></div>
      <div class="form-group"><input type="number" id="prod-price" class="input-field" placeholder="السعر"></div>
      <div class="form-group"><input type="file" id="prod-img" accept="image/*" class="input-field"></div>
      <button onclick="Store.addProduct()" class="btn-primary mb-2">➕ إضافة منتج</button>
      <div id="products-list">
    `;
    (data || []).forEach(p => {
      html += `
        <div class="list-item" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${p.name}</strong><br>
            <span style="color:var(--p)">${p.price} د.ع</span>
            <span class="badge ${p.status === 'متوفر' ? 'badge-success' : 'badge-warning'}" style="margin-right:5px">${p.status}</span>
          </div>
          <button onclick="Store.toggleProductStatus('${p.id}', '${p.status === 'متوفر' ? 'منتهي' : 'متوفر'}')" class="btn-outline" style="width:auto; padding:5px 10px; margin:0">🔄</button>
        </div>
      `;
    });
    html += `</div>`;
    return html;
  },

  // ➕ إضافة منتج جديد
  addProduct: async () => {
    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const imgFile = document.getElementById('prod-img').files[0];
    if (!name || !price) return alert('⚠️ أكمل بيانات المنتج');

    let imgUrl = null;
    if (imgFile) {
      const compressed = await Utils.compressImage(imgFile);
      const fileName = `products/${Date.now()}_${name}.jpg`;
      const { error: upErr } = await App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).upload(fileName, compressed);
      if (!upErr) imgUrl = App.db.storage.from(CONFIG.STORAGE_BUCKETS.products).getPublicUrl(fileName).data.publicUrl;
    }

    const { error } = await App.db.from('products').insert({
      store_id: App.user.id, name, price, image_url: imgUrl, status: 'متوفر'
    });
    if (error) return alert('❌ ' + error.message);
    App.router('store-products');
  },

  // 🔄 تغيير حالة المنتج (متوفر/منتهي)
  toggleProductStatus: async (id, newStatus) => {
    await App.db.from('products').update({ status: newStatus }).eq('id', id);
    App.router('store-products');
  },

  // 📋 عرض الطلبات الواردة
  renderOrders: async () => {
    const { data } = await App.db.from('orders').select('*, customer:customer_id(name, phone)').eq('store_id', App.user.id).eq('status', 'جديد').order('created_at', { ascending: false });
    if (!data || data.length === 0) return `<div class="text-center mt-2">📭 لا توجد طلبات جديدة</div>`;
    return data.map(o => `
      <div class="list-item">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong>طلب #${o.id.slice(0,6)}</strong>
          <span class="badge badge-info">${o.total_amount} د.ع</span>
        </div>
        <p>👤 ${o.customer?.name || 'زبون'} | 📱 ${o.customer?.phone || '-'}</p>
        <div style="display:flex; gap:10px; margin-top:10px;">
          <button onclick="Store.acceptOrder('${o.id}')" class="btn-primary" style="flex:1; margin:0">✅ قبول وتجهيز</button>
          <button onclick="Store.rejectOrder('${o.id}')" class="btn-danger" style="flex:1; margin:0">❌ رفض</button>
        </div>
      </div>
    `).join('');
  },

  // ✅ قبول الطلب وإشعار الديلفري
  acceptOrder: async (orderId) => {
    await App.db.from('orders').update({ status: 'قيد التجهيز' }).eq('id', orderId);
    alert('✅ تم قبول الطلب! جاري البحث عن أقرب دلفري...');
    // سيتم ربط منطق مطابقة الديلفري تلقائياً عند اكتمال الوحدة
    App.router('store-orders');
  },

  // ❌ رفض الطلب
  rejectOrder: async (orderId) => {
    await App.db.from('orders').update({ status: 'ملغي من المتجر' }).eq('id', orderId);
    App.router('store-orders');
  },

  // ⚙️ إعدادات المتجر (حالة الفتح/الإغلاق)
  renderSettings: () => `
    <div class="list-item">
      <h4>⚙️ حالة المتجر</h4>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button onclick="Store.setStoreStatus('مفتوح')" class="btn-primary" style="flex:1; margin:0">🟢 فتح المتجر</button>
        <button onclick="Store.setStoreStatus('مغلق')" class="btn-danger" style="flex:1; margin:0">🔴 إغلاق المتجر</button>
      </div>
    </div>
    <div class="list-item mt-2">
      <h4>🕒 أوقات العمل التلقائية (قيد التطوير)</h4>
      <p style="color:var(--g); font-size:13px">سيتم تفعيل الجدولة التلقائية قريباً.</p>
    </div>
  `,

  setStoreStatus: async (status) => {
    await App.db.from('profiles').update({ store_status: status }).eq('id', App.user.id);
    App.profile.store_status = status;
    alert(`✅ تم تغيير حالة المتجر إلى: ${status}`);
    App.router('store-dashboard');
  },

  // 🔔 الاستماع الفوري للطلبات الجديدة
  subscribeToOrders: () => {
    App.db.channel('store_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${App.user.id}` },
        (payload) => {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
          alert(`🔔 طلب جديد وارد! المبلغ: ${payload.new.total_amount} د.ع`);
        }
      )
      .subscribe();
  }
};

// دمج الوحدة مع التطبيق الرئيسي
if (typeof App !== 'undefined') {
  Store.init();
}
