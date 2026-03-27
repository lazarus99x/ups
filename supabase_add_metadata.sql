-- Run this in Supabase SQL Editor to add the metadata column
ALTER TABLE public.shipments 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
