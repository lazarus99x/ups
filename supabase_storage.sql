-- Run this in Supabase SQL Editor to set up photo storage
-- 1. Create the bucket (if using Supabase dashboard, just create a public bucket named 'shipment-photos')
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipment-photos', 'shipment-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone to read photos (public)
CREATE POLICY "Public can read shipment photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shipment-photos');

-- 3. Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'shipment-photos' AND auth.role() = 'authenticated');

-- 4. Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'shipment-photos' AND auth.role() = 'authenticated');
