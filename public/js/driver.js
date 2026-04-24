// ==========================================
// شراع | Shira Platform - Driver Module
// إدارة سائقي التاكسي وتوك توك (قبول، تنقل، إنهاء)
// ==========================================

const Driver = {
  activeRide: null,
  rideChannel: null,

  init: () => {
    // تسجيل مسارات السائق في الراوتر
    App.routes['driver-dashboard'] = Driver.renderDashboard;
    App.routes['driver-active'] = Driver.renderActiveRide;
    
    // تفعيل الاستماع الفوري لطلبات الرحلات
    Driver.subscribeToRides();
  },

  // 🚗 لوحة تحكم السائق
  renderDashboard: () => {
    const isOnline = App.profile.current_status === 'متصل';
    const subEnd = App.profile.subscription_end ? new Date(App.profile.subscription_end) : null;
    
    return `
      <div class="list-item">
        <h3>🚗 ${App.profile.name} (${App.profile.vehicle_type || 'سائق'})</h3>
        <p>المركبة: ${App.profile.vehicle_color || ''} ${App.profile.plate_number || ''}</p>
        <p>الحالة: <span class="badge ${isOnline ? 'badge-success' : 'badge-warning'}">${isOnline ? 'متصل' : 'غير متصل'}</span></p>
        <p>الاشتراك: ${subEnd ? Driver.getRemainingTime(subEnd) : 'غير محدد'}</p>
      </div>
      
      <button onclick="Driver.toggleOnline()" class="btn-primary mb-2">
        ${isOnline ? '🔴 إيقاف الاستقبال' : '🟢 بدء استقبال الطلبات'}
      </button>
      
      <div id="ride-requests" class="mt-2">
        <div class="text-center" style="color:var(--g); padding:20px;">📭 بانتظار طلبات الزبائن...</div>
      </div>
    `;
  },

  // ⏳ حساب الوقت المتبقي للاشتراك
  getRemainingTime: (endDate) => {
    const now = new Date();
    const diffMs = endDate - now;
    if (diffMs <= 0) return 'منتهي';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days} يوم و ${hours} ساعة`;
  },

  // 🔄 تبديل حالة الاتصال
  toggleOnline: async () => {
    const newStatus = App.profile.current_status === 'متصل' ? 'غير متصل' : 'متصل';
    await App.db.from('profiles').update({ current_status: newStatus }).eq('id', App.user.id);
    App.profile.current_status = newStatus;
    App.router('driver-dashboard');
  },

  // 📍 عرض الرحلة النشطة
  renderActiveRide: () => {
    if (!Driver.activeRide) return `<div class="text-center mt-2">لا توجد رحلة نشطة</div>`;
    const r = Driver.activeRide;
    
    return `
      <div class="list-item">
        <h4>🚕 رحلة جارية #${r.id.slice(0,6)}</h4>
        <p>👤 الزبون: ${r.customer_name || 'زبون'} | 📱 ${r.customer_phone || '-'}</p>
        <p>📍 الوجهة: ${r.dropoff_address}</p>
        <p>💰 السعر: <strong style="color:var(--p)">${r.final_price} د.ع</strong></p>
      </div>
      
      <div class="map-wrapper"><div id="map"></div></div>
      
      <div style="display:flex; gap:10px; margin-top:10px;">
        <a href="https://www.google.com/maps/dir/?api=1&destination=${r.pickup_lat},${r.pickup_lng}" target="_blank" class="btn-outline" style="flex:1; text-align:center; text-decoration:none; padding:12px;">📍 موقع الزبون</a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${r.dropoff_lat},${r.dropoff_lng}" target="_blank" class="btn-primary" style="flex:1; text-align:center; text-decoration:none; padding:12px;">🏁 الوجهة</a>
      </div>
      
      <div class="mt-2">
        ${r.status === 'قيد الانتظار' ? `<button onclick="Driver.updateStatus('${r.id}', 'قيد التنفيذ')" class="btn-success">✅ وصلت للزبون / ابدأ الرحلة</button>` : ''}
        ${r.status === 'قيد التنفيذ' ? `<button onclick="Driver.updateStatus('${r.id}', 'مكتملة')" class="btn-primary">🏁 إنهاء الرحلة واستلام المبلغ</button>` : ''}
        <button onclick="Driver.cancelRide('${r.id}')" class="btn-danger mt-2">❌ إلغاء الرحلة</button>
      </div>
    `;
  },

  // ✅ قبول طلب رحلة
  acceptRide: async (rideId) => {
    const { error } = await App.db.from('trips').update({
      status: 'تم القبول',
      driver_id: App.user.id,
      driver_accepted_at: new Date().toISOString()
    }).eq('id', rideId);
    
    if (error) return alert('❌ فشل القبول: ' + error.message);
    
    const { data } = await App.db.from('trips').select('*').eq('id', rideId).single();
    Driver.activeRide = data;
    App.router('driver-active');
    setTimeout(() => MapUtils.init(), 100);
  },

  //  تحديث حالة الرحلة
  updateStatus: async (rideId, status) => {
    await App.db.from('trips').update({ status, updated_at: new Date().toISOString() }).eq('id', rideId);
    Driver.activeRide.status = status;
    
    if (status === 'مكتملة') {
      // تسجيل الإيراد للسائق
      await App.db.from('revenues').insert({
        trip_id: rideId,
        driver_id: App.user.id,
        customer_id: Driver.activeRide.customer_id,
        amount: Driver.activeRide.final_price,
        status: 'مكتمل'
      });
      alert('🎉 تم إنهاء الرحلة بنجاح! المبلغ مضاف لرصيدك.');
      Driver.activeRide = null;
      App.router('driver-dashboard');
    } else {
      App.router('driver-active');
    }
  },

  // ❌ إلغاء الرحلة
  cancelRide: async (rideId) => {
    if (!confirm('هل أنت متأكد من إلغاء الرحلة؟ سيتم إشعار الزبون.')) return;
    await App.db.from('trips').update({ status: 'ملغاة من السائق' }).eq('id', rideId);
    Driver.activeRide = null;
    App.router('driver-dashboard');
  },

  // 🔔 الاستماع لطلبات الرحلات الجديدة
  subscribeToRides: () => {
    if (Driver.rideChannel) App.db.removeChannel(Driver.rideChannel);
    
    Driver.rideChannel = App.db.channel('driver_new_rides')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips', filter: 'status=eq.قيد الانتظار' },
        async (payload) => {
          if (App.profile.current_status !== 'متصل') return;
          
          const ride = payload.new;
          // تصفية حسب نوع المركبة إذا لزم (تاكسي/توك توك)
          if (ride.service_type !== App.profile.vehicle_type) return;
          
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
          
          const container = document.getElementById('ride-requests');
          if (container) {
            container.innerHTML = `
              <div class="list-item" style="border:2px solid var(--p); animation: pulse 1.5s infinite;">
                <h4>🔔 طلب رحلة جديد!</h4>
                <p>📍 المسافة التقريبية: ${ride.distance || 'قريب'} كم</p>
                <p>💰 السعر: ${ride.final_price} د.ع</p>
                <p>📝 ملاحظة: ${ride.notes || 'لا يوجد'}</p>
                <div style="display:flex; gap:10px; margin-top:10px;">
                  <button onclick="Driver.acceptRide('${ride.id}')" class="btn-primary" style="flex:1; margin:0">✅ قبول</button>
                  <button onclick="this.closest('.list-item').remove()" class="btn-danger" style="flex:1; margin:0">❌ رفض</button>
                </div>
              </div>
            `;
          }
        }
      )
      .subscribe();
  }
};

// تهيئة الوحدة عند تحميل التطبيق
if (typeof App !== 'undefined') {
  Driver.init();
}
