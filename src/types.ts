export type UserRole = 'admin' | 'staff' | 'customer';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  photoURL?: string;
}

export type ShipmentStatus = 'Active' | 'On Hold' | 'Delivered' | 'Cancelled';

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface HistoryItem {
  timestamp: string;
  status: string;
  location: string;
  description: string;
}

export interface ShipmentMetadata {
  sender?: { name?: string; email?: string; phone?: string; address?: string; city?: string; country?: string; };
  receiver?: { name?: string; email?: string; phone?: string; address?: string; city?: string; country?: string; };
  weight?: string;
  description?: string;
  photos?: string[]; // public URLs from Supabase Storage
  charges?: { label: string; amount: number }[];
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  senderId: string;
  receiverName: string;
  receiverEmail: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  currentLocation: Location;
  history: HistoryItem[];
  estimatedDelivery: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ShipmentMetadata;
}
