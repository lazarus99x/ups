import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import { usePhotoUpload } from '../lib/usePhotoUpload';
import { Shipment, ShipmentStatus } from '../types';
import {
  Plus, MapPin, Truck, Box, User, Mail, Phone,
  Play, Pause, X, Check, Package, Edit2, Trash2,
  Building, Hash, ImagePlus, Loader2, DollarSign, Trash
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

// Geocode any address/city string to real lat/lng using OpenStreetMap Nominatim (free, no key)
const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number }> => {
  if (!address.trim()) return { lat: 20.0, lng: 0.0 };
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn('Geocoding failed, using default coords:', err);
  }
  return { lat: 20.0, lng: 0.0 };
};

const SHIPMENT_STATUSES: ShipmentStatus[] = ['Active', 'On Hold', 'Delivered', 'Cancelled'];

const emptyForm = () => ({
  trackingNumber: `UPS-${Math.floor(100000 + Math.random() * 900000)}`,
  // Receiver
  receiverName: '',
  receiverEmail: '',
  receiverPhone: '',
  receiverAddress: '',
  receiverCity: '',
  receiverCountry: '',
  // Sender
  senderName: '',
  senderEmail: '',
  senderPhone: '',
  senderAddress: '',
  senderCity: '',
  senderCountry: '',
  // Shipment
  origin: '',
  destination: '',
  status: 'Active' as ShipmentStatus,
  weight: '',
  description: '',
  estimatedDeliveryDays: '7',
});

export const Admin: React.FC = () => {
  const { user } = useAuth();
  const { uploadPhotos, uploading: photoUploading } = usePhotoUpload();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [newShipment, setNewShipment] = useState(emptyForm());
  const [createPhotoFiles, setCreatePhotoFiles] = useState<File[]>([]);
  const [createPhotoPreviews, setCreatePhotoPreviews] = useState<string[]>([]);
  const [updatePhotoFiles, setUpdatePhotoFiles] = useState<File[]>([]);
  const [updatePhotoPreviews, setUpdatePhotoPreviews] = useState<string[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);

  // Photo selection handlers
  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setCreatePhotoFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setCreatePhotoPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handleUpdatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUpdatePhotoFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setUpdatePhotoPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  // Update modal state
  const [updateForm, setUpdateForm] = useState({
    status: 'Active' as ShipmentStatus,
    currentLocationAddress: '',
    historyStatus: '',
    historyDescription: '',
  });

  const [createCharges, setCreateCharges] = useState<{ label: string; amount: string }[]>([]);
  const [updateCharges, setUpdateCharges] = useState<{ label: string; amount: string }[]>([]);

  const addCharge = (isUpdate: boolean) => {
    const set = isUpdate ? setUpdateCharges : setCreateCharges;
    set(prev => [...prev, { label: '', amount: '' }]);
  };

  const removeCharge = (index: number, isUpdate: boolean) => {
    const set = isUpdate ? setUpdateCharges : setCreateCharges;
    set(prev => prev.filter((_, i) => i !== index));
  };

  const updateCharge = (index: number, field: 'label' | 'amount', value: string, isUpdate: boolean) => {
    const set = isUpdate ? setUpdateCharges : setCreateCharges;
    set(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const fetchShipments = async () => {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(row => ({
        id: row.id,
        trackingNumber: row.tracking_number,
        senderId: row.sender_id,
        receiverName: row.receiver_name,
        receiverEmail: row.receiver_email,
        origin: row.origin,
        destination: row.destination,
        status: row.status,
        currentLocation: row.current_location,
        history: row.history,
        estimatedDelivery: row.estimated_delivery,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata,
      } as Shipment));
      setShipments(mapped);
    } catch (err) {
      console.error('Error fetching admin shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
    const channel = supabase
      .channel('admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => fetchShipments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const originAddress = newShipment.origin || `${newShipment.senderCity}, ${newShipment.senderCountry}`;
    const originCoords = await geocodeAddress(originAddress);
    const deliveryDate = new Date(Date.now() + parseInt(newShipment.estimatedDeliveryDays) * 24 * 60 * 60 * 1000);

    try {
      const shipmentData = {
        tracking_number: newShipment.trackingNumber,
        sender_id: user.id,
        receiver_name: newShipment.receiverName,
        receiver_email: newShipment.receiverEmail,
        origin: newShipment.origin || `${newShipment.senderCity}, ${newShipment.senderCountry}`,
        destination: newShipment.destination || `${newShipment.receiverCity}, ${newShipment.receiverCountry}`,
        status: newShipment.status,
        current_location: {
          lat: originCoords.lat,
          lng: originCoords.lng,
          address: newShipment.origin || `${newShipment.senderCity}, ${newShipment.senderCountry}`,
        },
        history: [{
          timestamp: new Date().toISOString(),
          status: 'Shipment Created',
          location: newShipment.origin || `${newShipment.senderCity}, ${newShipment.senderCountry}`,
          description: `Package received and processed at origin facility. ${newShipment.description || ''}`.trim(),
        }],
        estimated_delivery: deliveryDate.toISOString(),
        metadata: {
          sender: {
            name: newShipment.senderName,
            email: newShipment.senderEmail,
            phone: newShipment.senderPhone,
            address: newShipment.senderAddress,
            city: newShipment.senderCity,
            country: newShipment.senderCountry,
          },
          receiver: {
            name: newShipment.receiverName,
            email: newShipment.receiverEmail,
            phone: newShipment.receiverPhone,
            address: newShipment.receiverAddress,
            city: newShipment.receiverCity,
            country: newShipment.receiverCountry,
          },
          weight: newShipment.weight,
          description: newShipment.description,
          photos: createPhotoFiles.length > 0 ? await uploadPhotos(createPhotoFiles) : [],
          charges: createCharges.filter(c => c.label && c.amount).map(c => ({
            label: c.label,
            amount: parseFloat(c.amount) || 0
          })),
        },
      };

      const { error } = await supabase.from('shipments').insert([shipmentData]);
      if (error) throw error;

      setShowAddModal(false);
      setNewShipment(emptyForm());
      setCreatePhotoFiles([]);
      setCreatePhotoPreviews([]);
      setCreateCharges([]);
    } catch (err) {
      console.error('Error creating shipment:', err);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShipment) return;

    const locationText = updateForm.currentLocationAddress || editingShipment.currentLocation.address;
    const newCoords = updateForm.currentLocationAddress
      ? await geocodeAddress(updateForm.currentLocationAddress)
      : { lat: editingShipment.currentLocation.lat, lng: editingShipment.currentLocation.lng };

    const newHistoryEntry = {
      timestamp: new Date().toISOString(),
      status: updateForm.historyStatus || updateForm.status,
      location: updateForm.currentLocationAddress || editingShipment.currentLocation.address,
      description: updateForm.historyDescription || `Status updated to ${updateForm.status}.`,
    };

    try {
      const newPhotoUrls = updatePhotoFiles.length > 0 ? await uploadPhotos(updatePhotoFiles) : [];
      const existingPhotos = editingShipment.metadata?.photos || [];

      const { error } = await supabase
        .from('shipments')
        .update({
          status: updateForm.status,
          current_location: {
            lat: newCoords.lat,
            lng: newCoords.lng,
            address: locationText,
          },
          history: [newHistoryEntry, ...editingShipment.history],
          updated_at: new Date().toISOString(),
          metadata: {
            ...(editingShipment.metadata || {}),
            photos: [...existingPhotos, ...newPhotoUrls],
            charges: updateCharges.filter(c => c.label && c.amount).map(c => ({
              label: c.label,
              amount: parseFloat(c.amount) || 0
            })),
          },
        })
        .eq('id', editingShipment.id);

      if (error) throw error;
      setEditingShipment(null);
      setUpdatePhotoFiles([]);
      setUpdatePhotoPreviews([]);
      setUpdateCharges([]);
    } catch (err) {
      console.error('Error updating shipment:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this shipment permanently?')) return;
    await supabase.from('shipments').delete().eq('id', id);
  };

  // Simulation
  useEffect(() => {
    if (!simulatingId) return;
    const interval = setInterval(async () => {
      const shipment = shipments.find(s => s.id === simulatingId);
      if (!shipment || shipment.status !== 'Active') { setSimulatingId(null); return; }
      const newLat = shipment.currentLocation.lat + (Math.random() - 0.5) * 0.08;
      const newLng = shipment.currentLocation.lng + (Math.random() - 0.5) * 0.08;
      await supabase.from('shipments').update({
        current_location: { lat: newLat, lng: newLng, address: `In Transit – ${newLat.toFixed(4)}, ${newLng.toFixed(4)}` },
        updated_at: new Date().toISOString(),
      }).eq('id', shipment.id);
    }, 4000);
    return () => clearInterval(interval);
  }, [simulatingId, shipments]);

  const openUpdateModal = (shipment: Shipment) => {
    setEditingShipment(shipment);
    setUpdateForm({
      status: shipment.status,
      currentLocationAddress: shipment.currentLocation.address,
      historyStatus: '',
      historyDescription: '',
    });
    setUpdateCharges((shipment.metadata?.charges || []).map(c => ({
      label: c.label,
      amount: c.amount.toString()
    })));
  };

  const inputCls = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-ups-brown focus:border-transparent transition-all outline-none text-sm";
  const labelCls = "block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1";

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-ups-brown">Admin Panel</h1>
            <p className="text-gray-500 mt-1">Create, track, and update shipments in real-time.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-ups-brown text-ups-yellow px-8 py-4 rounded-2xl font-bold hover:bg-ups-brown/90 transition-all flex items-center gap-2 shadow-xl shadow-ups-brown/10 border border-ups-yellow/10"
          >
            <Plus className="w-5 h-5" /> New Shipment
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Tracking #</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Receiver</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Route</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Location</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading shipments...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center">
                    <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">No shipments yet. Create your first one!</p>
                  </td></tr>
                ) : shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-ups-brown group-hover:text-ups-yellow transition-colors">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-ups-brown text-sm">{s.trackingNumber}</p>
                          <p className="text-xs text-gray-400">{format(new Date(s.createdAt), 'MMM dd, yyyy')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-semibold text-gray-900 text-sm">{s.receiverName}</p>
                      <p className="text-xs text-gray-400">{s.receiverEmail}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium">{s.origin}</span>
                        <span>→</span>
                        <span className="font-medium">{s.destination}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                        s.status === 'Active' ? 'bg-blue-50 text-blue-700' :
                        s.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700' :
                        s.status === 'On Hold' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      )}>{s.status}</span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs text-gray-500 max-w-[180px] truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />{s.currentLocation.address}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openUpdateModal(s)}
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"
                          title="Update Shipment"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSimulatingId(simulatingId === s.id ? null : s.id)}
                          className={cn("p-2 rounded-lg transition-all", simulatingId === s.id ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}
                          title={simulatingId === s.id ? "Stop Simulation" : "Simulate Movement"}
                        >
                          {simulatingId === s.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-2 bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─────────── CREATE SHIPMENT MODAL ─────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden my-8 mb-20">
            <div className="p-8 bg-ups-brown text-ups-yellow flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">New Shipment</h2>
                <p className="text-ups-yellow/70 text-sm mt-1">Fill in all details to generate a tracking record.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-8 space-y-8">
              {/* Tracking ID */}
              <div className="flex items-center gap-4 p-4 bg-ups-brown/5 rounded-2xl border border-ups-brown/10">
                <Hash className="w-5 h-5 text-ups-brown" />
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Auto-Generated Tracking ID</p>
                  <p className="font-black text-ups-brown text-lg">{newShipment.trackingNumber}</p>
                </div>
              </div>

              {/* Sender Section */}
              <div>
                <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Building className="w-4 h-4" /> Sender Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={labelCls}>Full Name</label><input className={inputCls} required placeholder="Jane Smith" value={newShipment.senderName} onChange={e => setNewShipment({...newShipment, senderName: e.target.value})} /></div>
                  <div><label className={labelCls}>Email</label><input type="email" className={inputCls} placeholder="jane@company.com" value={newShipment.senderEmail} onChange={e => setNewShipment({...newShipment, senderEmail: e.target.value})} /></div>
                  <div><label className={labelCls}>Phone</label><input className={inputCls} placeholder="+1 555 000 0000" value={newShipment.senderPhone} onChange={e => setNewShipment({...newShipment, senderPhone: e.target.value})} /></div>
                  <div><label className={labelCls}>Street Address</label><input className={inputCls} placeholder="123 Main St" value={newShipment.senderAddress} onChange={e => setNewShipment({...newShipment, senderAddress: e.target.value})} /></div>
                  <div><label className={labelCls}>City / Origin</label><input required className={inputCls} placeholder="New York" value={newShipment.senderCity} onChange={e => setNewShipment({...newShipment, senderCity: e.target.value, origin: `${e.target.value}, ${newShipment.senderCountry}`})} /></div>
                  <div><label className={labelCls}>Country</label><input required className={inputCls} placeholder="USA" value={newShipment.senderCountry} onChange={e => setNewShipment({...newShipment, senderCountry: e.target.value, origin: `${newShipment.senderCity}, ${e.target.value}`})} /></div>
                </div>
              </div>

              {/* Receiver Section */}
              <div>
                <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" /> Recipient Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={labelCls}>Full Name</label><input className={inputCls} required placeholder="John Doe" value={newShipment.receiverName} onChange={e => setNewShipment({...newShipment, receiverName: e.target.value})} /></div>
                  <div><label className={labelCls}>Email</label><input type="email" className={inputCls} required placeholder="john@email.com" value={newShipment.receiverEmail} onChange={e => setNewShipment({...newShipment, receiverEmail: e.target.value})} /></div>
                  <div><label className={labelCls}>Phone</label><input className={inputCls} placeholder="+44 7700 000000" value={newShipment.receiverPhone} onChange={e => setNewShipment({...newShipment, receiverPhone: e.target.value})} /></div>
                  <div><label className={labelCls}>Street Address</label><input className={inputCls} placeholder="45 Baker Street" value={newShipment.receiverAddress} onChange={e => setNewShipment({...newShipment, receiverAddress: e.target.value})} /></div>
                  <div><label className={labelCls}>City / Destination</label><input required className={inputCls} placeholder="London" value={newShipment.receiverCity} onChange={e => setNewShipment({...newShipment, receiverCity: e.target.value, destination: `${e.target.value}, ${newShipment.receiverCountry}`})} /></div>
                  <div><label className={labelCls}>Country</label><input required className={inputCls} placeholder="UK" value={newShipment.receiverCountry} onChange={e => setNewShipment({...newShipment, receiverCountry: e.target.value, destination: `${newShipment.receiverCity}, ${e.target.value}`})} /></div>
                </div>
              </div>

              {/* Package Details */}
              <div>
                <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Box className="w-4 h-4" /> Package Details
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Initial Status</label>
                    <select className={inputCls} value={newShipment.status} onChange={e => setNewShipment({...newShipment, status: e.target.value as ShipmentStatus})}>
                      {SHIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>Weight (kg)</label><input className={inputCls} placeholder="2.5" value={newShipment.weight} onChange={e => setNewShipment({...newShipment, weight: e.target.value})} /></div>
                  <div><label className={labelCls}>Est. Delivery (days)</label><input type="number" className={inputCls} min="1" max="60" value={newShipment.estimatedDeliveryDays} onChange={e => setNewShipment({...newShipment, estimatedDeliveryDays: e.target.value})} /></div>
                  <div className="col-span-3"><label className={labelCls}>Package Description</label><textarea className={inputCls} rows={2} placeholder="e.g. Electronics, Documents, Clothing..." value={newShipment.description} onChange={e => setNewShipment({...newShipment, description: e.target.value})} /></div>
                </div>
              </div>

              {/* Package Photos */}
              <div>
                <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ImagePlus className="w-4 h-4" /> Package Photos
                </h3>
                <input
                  ref={createFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleCreatePhotoSelect}
                />
                <button
                  type="button"
                  onClick={() => createFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-5 text-sm text-gray-400 hover:border-ups-brown hover:text-ups-brown transition-all flex items-center justify-center gap-2"
                >
                  <ImagePlus className="w-5 h-5" /> Click to add package photos
                </button>
                {createPhotoPreviews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {createPhotoPreviews.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} className="w-full h-20 object-cover rounded-xl border border-gray-100" />
                        <button
                          type="button"
                          onClick={() => {
                            setCreatePhotoPreviews(p => p.filter((_, j) => j !== i));
                            setCreatePhotoFiles(p => p.filter((_, j) => j !== i));
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Charges */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Additional Charges
                  </h3>
                  <button
                    type="button"
                    onClick={() => addCharge(false)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" /> Add Charge
                  </button>
                </div>
                
                {createCharges.length === 0 ? (
                  <div className="p-6 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl text-center">
                    <p className="text-xs text-gray-400 font-medium italic">No charges added. These only appear on the printed invoice.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {createCharges.map((charge, i) => (
                      <div key={i} className="flex gap-3 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex-1">
                          <input
                            className={inputCls}
                            placeholder="e.g. Service Fee"
                            value={charge.label}
                            onChange={e => updateCharge(i, 'label', e.target.value, false)}
                          />
                        </div>
                        <div className="w-32 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className={cn(inputCls, "pl-7")}
                            placeholder="0.00"
                            value={charge.amount}
                            onChange={e => updateCharge(i, 'amount', e.target.value, false)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCharge(i, false)}
                          className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2 pr-12">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Total Charges: <span className="text-ups-brown ml-1">$ {createCharges.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0).toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={photoUploading}
                className="w-full bg-ups-brown text-ups-yellow py-5 rounded-2xl font-bold hover:bg-ups-brown/90 transition-all flex items-center justify-center gap-2 border border-ups-yellow/10 text-base disabled:opacity-60"
              >
                {photoUploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Uploading photos...</> : <><Check className="w-5 h-5" /> Create Shipment & Generate Tracking</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─────────── UPDATE SHIPMENT MODAL ─────────── */}
      {editingShipment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden my-8 mb-20">
            <div className="p-8 bg-ups-brown text-ups-yellow flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Update Shipment</h2>
                <p className="text-ups-yellow/70 text-sm mt-1 font-mono">{editingShipment.trackingNumber}</p>
              </div>
              <button onClick={() => setEditingShipment(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-8 space-y-5">
              <div>
                <label className={labelCls}>New Status</label>
                <select className={inputCls} value={updateForm.status} onChange={e => setUpdateForm({...updateForm, status: e.target.value as ShipmentStatus})}>
                  {SHIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Current Location (City, Country)</label>
                <input
                  className={inputCls}
                  placeholder="e.g. London, UK  or  Paris, FR"
                  value={updateForm.currentLocationAddress}
                  onChange={e => setUpdateForm({...updateForm, currentLocationAddress: e.target.value})}
                />
                <p className="text-xs text-gray-400 mt-1">This updates the live map marker. Use a recognized city name for accuracy.</p>
              </div>
              <div>
                <label className={labelCls}>History Event Label</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Arrived at Sorting Facility"
                  value={updateForm.historyStatus}
                  onChange={e => setUpdateForm({...updateForm, historyStatus: e.target.value})}
                />
              </div>
              <div>
                <label className={labelCls}>Event Description</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  placeholder="e.g. Package has arrived at London Heathrow customs clearance."
                  value={updateForm.historyDescription}
                  onChange={e => setUpdateForm({...updateForm, historyDescription: e.target.value})}
                />
              </div>

              {/* History Preview */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">History ({editingShipment.history.length} events)</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {editingShipment.history.slice(0, 4).map((h, i) => (
                    <div key={i} className="flex gap-3 text-xs">
                      <span className="text-gray-400 whitespace-nowrap">{format(new Date(h.timestamp), 'MMM dd, HH:mm')}</span>
                      <span className="font-semibold text-gray-700">{h.status}</span>
                      <span className="text-gray-500 truncate">{h.location}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add More Photos */}
              <div>
                <label className={labelCls}>Add More Photos</label>
                <input
                  ref={updateFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleUpdatePhotoSelect}
                />
                <button
                  type="button"
                  onClick={() => updateFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-ups-brown hover:text-ups-brown transition-all flex items-center justify-center gap-2"
                >
                  <ImagePlus className="w-4 h-4" /> Add photos to this update
                </button>
                {updatePhotoPreviews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {updatePhotoPreviews.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} className="w-full h-16 object-cover rounded-xl border border-gray-100" />
                        <button
                          type="button"
                          onClick={() => {
                            setUpdatePhotoPreviews(p => p.filter((_, j) => j !== i));
                            setUpdatePhotoFiles(p => p.filter((_, j) => j !== i));
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Existing photos */}
                {editingShipment.metadata?.photos && editingShipment.metadata.photos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Existing Photos ({editingShipment.metadata.photos.length})</p>
                    <div className="grid grid-cols-4 gap-2">
                      {editingShipment.metadata.photos.map((url, i) => (
                        <img key={i} src={url} className="w-full h-16 object-cover rounded-xl border border-gray-100" />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Charges */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-ups-brown uppercase tracking-widest flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Invoice Charges
                  </h3>
                  <button
                    type="button"
                    onClick={() => addCharge(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" /> Add Charge
                  </button>
                </div>
                
                {updateCharges.length === 0 ? (
                  <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl text-center">
                    <p className="text-[10px] text-gray-400 font-medium italic">No charges added to this shipment yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {updateCharges.map((charge, i) => (
                      <div key={i} className="flex gap-2 items-center animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="flex-1">
                          <input
                            className={cn(inputCls, "py-2 px-3")}
                            placeholder="Charge Label"
                            value={charge.label}
                            onChange={e => updateCharge(i, 'label', e.target.value, true)}
                          />
                        </div>
                        <div className="w-24 relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className={cn(inputCls, "pl-5 py-2 px-3")}
                            placeholder="0.00"
                            value={charge.amount}
                            onChange={e => updateCharge(i, 'amount', e.target.value, true)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCharge(i, true)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-end pt-1 pr-10">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Total: <span className="text-ups-brown ml-1">$ {updateCharges.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0).toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={photoUploading}
                className="w-full bg-ups-brown text-ups-yellow py-4 rounded-2xl font-bold hover:bg-ups-brown/90 transition-all flex items-center justify-center gap-2 border border-ups-yellow/10 disabled:opacity-60"
              >
                {photoUploading ? <><Loader2 className="w-4 h-4 animate-spin"/> Uploading...</> : <><Check className="w-5 h-5" /> Save Update & Push to Tracking</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
