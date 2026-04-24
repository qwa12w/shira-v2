// ==========================================
// شراع | Shira Platform - Delivery Module
// إدارة طلبات التوصيل، التنقل، وحل المشكلات
// ==========================================

const Delivery = {
  activeOrder: null,
  
  init: () => {
    // تسجيل مسارات الدلفري في الراوتر
    App.routes['delivery-dashboard'] = Delivery.renderDashboard;
    App.routes['delivery-active'] = Delivery.renderActive;
    
    // تفعيل الاستماع الفوري للطلبات الجديدة
    Delivery.subscribeToNewRequests();
  },

  // 🏍️ لوحة التحكم الخاصة بالدلفري
  renderDashboard: () => {
    const statusBadge = App.profile.current_status === 'متصل' ? 'badge-success' : 'badge-warning';
    return `
      <div class="list-item">
        <h3>🏍️ دلفري: ${App.profile.name}</h3>
        <p>الحالة: <span class="badge ${statusBadge}">${App.profile.current_status || 'غير متصل'}</span></p>
        <p>الاشتراك ينتهي: ${App.profile.subscription_end ? Utils.formatAR(App.profile.subscription_end) : 'غير محدد'}</p>
      </div>
      <button onclick="Delivery.toggleAvailability()" class="btn-primary mb-2">🔄 تبديل الحالة (متصل/غير متصل)</button>
      <div id="pending-requests" class="mt-2">
        <div class="text-center" style="color:var(--g)">📭 بانتظار الطلبات الجديدة...</div>
      </div>
    `;
  },

  // 🔄 تبديل حالة الاتصال
  toggleAvailability: async () => {
    const newStatus = App.profile.current_status === 'متصل' ? 'غير متصل' : 'متصل';
    await App.db.from('profiles').update({ current_status: newStatus }).eq('id', App.user.id);
    App.profile.current_status = newStatus;
    App.router('delivery-dashboard');
  },

  // 📦 عرض الطلب النشط (قيد التوصيل)
  renderActive: () => {
    if (!Delivery.activeOrder) return `<div class="text-center mt-2">لا يوجد طلب نشط حالياً</div>`;
    const o = Delivery.activeOrder;
    
    return `
      <div class="list-item">
        <h4>📦 الطلب: #${o.id.slice(0,6)}</h4>
        <p>🏪 المتجر: ${o.store_name || 'غير محدد'}</p>
        <p>👤 الزبون: ${o.customer_name || 'زبون'}</p>
        <p>📍 الوجهة: ${o.dropoff_address}</p>
        <p>💰 المبلغ للتحصيل: <strong style="color:var(--p)">${o.total_amount} د.ع</strong></p>
      </div>
      
      <div class="map-wrapper"><div id="map"></div></div>
      
      <div style="display:flex; gap:10px; margin-top:10px;">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${o.pickup_lat},${o.pickup_lng}" target="_blank" class="btn-outline" style="flex:1; text-align:center; text-decoration:none; padding:12px;">📍 المتجر (ويز/جوجل)</a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${o.dropoff_lat},${o.dropoff_lng}" target="_blank" class="btn-primary" style="flex:1; text-align:center; text-decoration:none; padding:12px;">🚀 الزبون (ويز/جوجل)</a>
      </div>
      
      <button onclick="Delivery.updateStatus('${o.id}', 'تم الاستلام من المتجر')" class="btn-success mt-2">✅ استلمت المنتجات من المتجر</button>
      <button onclick="Delivery.updateStatus('${o.id}', 'تم التسليم')" class="btn-primary mt-2" style="display:none" id="btn-deliver">📦 تسليم الطلب للزبون واستلام المبلغ</button>
      <button onclick="Delivery.reportProblem('${o.id}')" class="btn-danger mt-2">⚠️ الإبلاغ عن مشكلة</button>
    `;
  },

  // ✅ تحديث حالة الطلب خطوة بخطوة
  updateStatus: async (orderId, status) => {
    await App.db.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    Delivery.activeOrder.status = status;
    
    if (status === 'تم الاستلام من المتجر') {
      document.getElementById('btn-deliver').style.display = 'block';
      alert('✅ تم الاستلام! توجه الآن إلى الزبون.');
      if (App.map && Delivery.activeOrder.dropoff_lat) {
        App.map.setView([Delivery.activeOrder.dropoff_lat, Delivery.activeOrder.dropoff_lng], 15);
        L.marker([Delivery.activeOrder.dropoff_lat, Delivery.activeOrder.dropoff_lng]).addTo(App.map).bindPopup('📍 موقع الزبون').openPopup();
      }
    } else if (status === 'تم التسليم') {
      alert('🎉 تم تسليم الطلب بنجاح!');
      // تسجيل الإيراد
      await App.db.from('revenues').insert({
        trip_id: orderId, 
        driver_id: App.user.id, 
        customer_id: Delivery.activeOrder.customer_id,
        amount: Delivery.activeOrder.delivery_fee || 0, 
        status: 'مكتمل'
      });
      Delivery.activeOrder = null;
      App.router('delivery-dashboard');
    } else {
      App.router('delivery-active');
    }
  },

  // ⚠️ الإبلاغ عن مشكلة (رفض زبون، منتج تالف، إلخ)
  reportProblem: (orderId) => {
    const reason = prompt('حدد نوع المشكلة:\n1. الزبون يرفض الاستلام\n2. الهاتف مغلق/لا يرد\n3. المنتج تالف أو مفتوح\n4. أخرى');
    if (!reason) return;
    
    App.db.from('notifications').insert({
      user_id: Delivery.activeOrder.store_id,
      title: '⚠️ مشكلة في طلب التوصيل',
      message: `طلب #${orderId.slice(0,6)}: ${reason}. يرجى الرد خلال 10 دقائق.`,
      type: 'warning'
    }).then(() => alert('📩 تم إبلاغ المتجر. بانتظار التعليمات...'));
  },

  // 🔔 الاستماع للطلبات الجديدة المخصصة للدلفري القريب
  subscribeToNewRequests: () => {
    App.db.channel('delivery_new_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.جديد' },
        (payload) => {
          if (App.profile.current_status !== 'متصل') return;
          
          const newOrder = payload.new;
          if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
          
          const container = document.getElementById('pending-requests');
          if (container) {
            container.innerHTML = `
              <div class="list-item" style="border:2px solid var(--p); animation: pulse 2s infinite;">
                <h4>🔔 طلب توصيل جديد!</h4>
                <p>🏪 متجر: ${newOrder.store_name || 'غير محدد'}</p>
                <p>📦 عدد المنتجات: ${newOrder.items_count || 1}</p>
                <p>💰 أجر التوصيل: ${newOrder.delivery_fee} د.ع</p>
                <div style="display:flex; gap:10px; margin-top:10px;">
                  <button onclick="Delivery.acceptRequest('${newOrder.id}')" class="btn-primary" style="flex:1; margin:0">✅ قبول</button>
                  <button onclick="this.closest('.list-item').remove()" class="btn-danger" style="flex:1; margin:0">❌ رفض</button>
                </div>
              </div>
            `;
          }
        }
      )
      .subscribe();
  },

  acceptRequest: async (orderId) => {
    const { error } = await App.db.from('orders').update({
      status: 'مقبول من الديلفري',
      delivery_driver_id: App.user.id,
      accepted_at: new Date().toISOString()
    }).eq('id', orderId);
    
    if (error) return alert('❌ فشل القبول: ' + error.message);
    
    const { data } = await App.db.from('orders').select('*').eq('id', orderId).single();
    Delivery.activeOrder = data;
    App.router('delivery-active');
    setTimeout(() => MapUtils.init(), 100);
  }
};

// ربط الوحدة بالتطبيق الرئيسي
if (typeof App !== 'undefined') {
  Delivery.init();
}
