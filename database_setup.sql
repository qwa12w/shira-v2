-- ==========================================
-- شراع | Shira Platform - Complete Database Setup
-- متوافق مع جميع الوحدات (Auth, Store, Driver, Delivery)
-- ==========================================

-- 1. تفعيل الإضافات
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. إنشاء الجداول الأساسية
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT UNIQUE,
  role TEXT DEFAULT 'زبون', -- زبون, سائق تكسي, سائق توك توك, صاحب متجر, دلفري
  status TEXT DEFAULT 'قيد المراجعة', -- نشط, قيد المراجعة, محظور
  current_status TEXT DEFAULT 'غير متصل', -- متصل, غير متصل
  subscription_start TIMESTAMPTZ,
  subscription_end TIMESTAMPTZ,
  subscription_plan TEXT,
  store_name TEXT,
  store_status TEXT DEFAULT 'مغلق', -- مفتوح, مغلق
  total_trips INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0,
  vehicle_type TEXT,
  plate_number TEXT,
  vehicle_color TEXT,
  bike_status TEXT,
  gender TEXT,
  profile_image TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES profiles(id),
  driver_id UUID REFERENCES profiles(id),
  service_type TEXT, -- تاكسي, توك توك
  pickup_lat DECIMAL(10,8),
  pickup_lng DECIMAL(11,8),
  dropoff_address TEXT,
  dropoff_lat DECIMAL(10,8),
  dropoff_lng DECIMAL(11,8),
  final_price DECIMAL(10,2),
  status TEXT DEFAULT 'قيد الانتظار', -- قيد الانتظار, تم القبول, قيد التنفيذ, مكتملة, ملغاة
  driver_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES profiles(id),
  customer_id UUID REFERENCES profiles(id),
  delivery_driver_id UUID REFERENCES profiles(id),
  store_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  items_count INTEGER DEFAULT 1,
  total_amount DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),
  pickup_lat DECIMAL(10,8),
  pickup_lng DECIMAL(11,8),
  dropoff_lat DECIMAL(10,8),
  dropoff_lng DECIMAL(11,8),
  dropoff_address TEXT,
  status TEXT DEFAULT 'جديد', -- جديد, قيد التجهيز, مقبول من الديلفري, تم الاستلام من المتجر, تم التسليم, ملغي
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'متوفر', -- متوفر, منتهي
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID,
  order_id UUID,
  driver_id UUID REFERENCES profiles(id),
  customer_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'مكتمل',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- info, warning, error, success
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. الفهارس (لتسريع الاستعلامات)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 4. تفعيل Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE trips; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 5. سياسات الأمان (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_read_policy" ON profiles;
CREATE POLICY "profiles_read_policy" ON profiles FOR SELECT USING (
  auth.uid() = id OR status = 'نشط'
);
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
CREATE POLICY "profiles_update_policy" ON profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trips_policy" ON trips;
CREATE POLICY "trips_policy" ON trips FOR ALL USING (
  auth.uid() = customer_id OR auth.uid() = driver_id OR auth.uid() IN (SELECT id FROM admin_users)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_policy" ON orders;
CREATE POLICY "orders_policy" ON orders FOR ALL USING (
  auth.uid() = store_id OR auth.uid() = customer_id OR auth.uid() = delivery_driver_id OR auth.uid() IN (SELECT id FROM admin_users)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_policy" ON products;
CREATE POLICY "products_policy" ON products FOR ALL USING (
  auth.uid() = store_id OR auth.uid() IN (SELECT id FROM admin_users)
);

ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revenues_policy" ON revenues;
CREATE POLICY "revenues_policy" ON revenues FOR SELECT USING (
  auth.uid() = driver_id OR auth.uid() IN (SELECT id FROM admin_users)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_policy" ON notifications;
CREATE POLICY "notifications_policy" ON notifications FOR ALL USING (auth.uid() = user_id OR auth.uid() IN (SELECT id FROM admin_users));

-- 6. الدوال المساعدة
CREATE OR REPLACE FUNCTION activate_subscription(p_user_id UUID, p_months INTEGER)
RETURNS VOID AS $$
DECLARE
  v_start TIMESTAMPTZ := NOW();
  v_end TIMESTAMPTZ;
  v_plan TEXT;
BEGIN
  v_plan := CASE p_months WHEN 1 THEN 'شهري' WHEN 3 THEN 'ثلاثي' WHEN 6 THEN 'نصف سنوي' ELSE 'سنوي' END;
  v_end := v_start + (p_months || ' months')::INTERVAL;
  UPDATE profiles SET status = 'نشط', subscription_start = v_start, subscription_end = v_end, subscription_plan = v_plan WHERE id = p_user_id;
  INSERT INTO notifications (user_id, title, message, type) VALUES (p_user_id, '✅ تم تفعيل الاشتراك', 'تم تفعيل حسابك لمدة ' || p_months || ' أشهر.', 'success');
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. إشعارات تلقائية عند تغيير الحالة
CREATE OR REPLACE FUNCTION notify_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.customer_id,
      '🔄 تحديث حالة الطلب',
      'تم تغيير حالة طلبك إلى: ' || NEW.status,
      'info'
    );
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trip_status_trigger AFTER INSERT OR UPDATE OF status ON trips FOR EACH ROW EXECUTE FUNCTION notify_status_change();
CREATE TRIGGER order_status_trigger AFTER INSERT OR UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION notify_status_change();

-- 8. إعادة تحميل المخطط
NOTIFY pgrst, 'reload schema';
SELECT '✅ تم إعداد قاعدة البيانات بنجاح - جاهزة للإنتاج' AS result;
