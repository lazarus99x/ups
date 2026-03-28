import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';
import { Shipment } from '../types';
import { Link } from 'react-router-dom';
import { 
  Package, MapPin, Clock, ChevronRight, 
  Search, Filter, Plus, Truck, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchShipments = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('sender_id', user.id)
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
        updatedAt: row.updated_at
      } as Shipment));
      
      setShipments(mapped);
    } catch (err) {
      console.error('Error fetching shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchShipments();

    const channel = supabase
      .channel('dashboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shipments',
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          fetchShipments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filteredShipments = shipments?.filter(s => 
    s.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.receiverName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ups-brown"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-ups-brown">My Shipments</h1>
              <p className="text-gray-500 mt-2">Track and manage all your active and past shipments.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search tracking ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-ups-brown focus:border-transparent transition-all outline-none w-64"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        {filteredShipments?.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-20 text-center border border-gray-100 shadow-sm">
            <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Package className="text-gray-300 w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-ups-brown mb-2">No shipments found</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              You haven't sent any packages yet. Start by tracking an existing one.
            </p>
            <Link to="/" className="inline-flex items-center gap-2 bg-ups-brown text-ups-yellow px-8 py-3 rounded-full font-bold hover:bg-ups-brown/90 transition-all">
              Track a Package
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredShipments?.map((shipment) => (
              <Link
                key={shipment.id}
                to={`/tracking/${shipment.trackingNumber}`}
                className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-ups-brown/10 transition-all group"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-start gap-6">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-ups-brown group-hover:text-ups-yellow transition-colors">
                      <Truck className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-bold text-ups-brown">{shipment.trackingNumber}</h3>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                          shipment.status === 'Active' ? 'bg-blue-50 text-blue-700' :
                          shipment.status === 'Out for Delivery' ? 'bg-indigo-50 text-indigo-700' :
                          shipment.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700' :
                          shipment.status === 'On Hold' ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        )}>
                          {shipment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {shipment.currentLocation.address}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {format(new Date(shipment.createdAt), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-12">
                    <div className="hidden sm:block">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Receiver</h4>
                      <p className="font-bold text-gray-900">{shipment.receiverName}</p>
                    </div>
                    <div className="hidden sm:block">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Destination</h4>
                      <p className="font-bold text-gray-900">{shipment.destination}</p>
                    </div>
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center group-hover:translate-x-2 transition-transform">
                      <ChevronRight className="w-6 h-6 text-gray-400" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
