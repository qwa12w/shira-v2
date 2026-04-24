// ==========================================
// شراع | Shira Platform - Utilities
// ==========================================

const Utils = {
  // ✅ ضغط الصور تلقائياً قبل الرفع
  compressImage: async (file, maxWidth = 800, quality = 0.7) => {
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
          if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
        };
      };
    });
  },

  // ✅ فرض إذن الموقع الجغرافي
  enforceGPS: () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject('المتصفح لا يدعم خدمات الموقع');
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  },

  // ✅ تنسيق التاريخ والوقت بالعربية
  formatAR: (dateStr) => {
    if (!dateStr) return 'غير محدد';
    return new Date(dateStr).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  // ✅ فتح واتساب الإدارة
  openWhatsApp: () => {
    window.open(`https://wa.me/${CONFIG.WHATSAPP_ADMIN}`, '_blank');
  },

  // ✅ فتح نافذة المراسلة الداخلية
  openInAppChat: () => {
    alert('📨 سيتم تفعيل نظام المراسلة الداخلية مع الإدارة قريباً.');
  }
};
