import { useState } from 'react';
import { supabase } from './supabase';

export const usePhotoUpload = () => {
  const [uploading, setUploading] = useState(false);

  const uploadPhotos = async (files: File[]): Promise<string[]> => {
    setUploading(true);
    const urls: string[] = [];

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `packages/${fileName}`;

        const { error } = await supabase.storage
          .from('shipment-photos')
          .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) {
          console.error('Upload error:', error);
          continue;
        }

        const { data } = supabase.storage
          .from('shipment-photos')
          .getPublicUrl(path);

        if (data?.publicUrl) {
          urls.push(data.publicUrl);
        }
      }
    } finally {
      setUploading(false);
    }

    return urls;
  };

  return { uploadPhotos, uploading };
};
