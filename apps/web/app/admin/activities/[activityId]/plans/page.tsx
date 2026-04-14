'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ActivityPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  price_type: 'per_person' | 'per_group';
  base_price: number;
  min_participants: number;
  max_participants: number;
  booking_type: 'scheduled' | 'request' | 'instant';
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

interface PlansData {
  activity: { id: string; title: string };
  plans: ActivityPlan[];
}

export default function ActivityPlanManagementPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = params.activityId as string;

  const [plans, setPlans] = useState<ActivityPlan[]>([]);
  const [activityTitle, setActivityTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ActivityPlan | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price_type: 'per_person' as 'per_person' | 'per_group',
    base_price: 0,
    min_participants: 1,
    max_participants: 10,
    booking_type: 'scheduled' as 'scheduled' | 'request' | 'instant',
    status: 'active' as 'active' | 'inactive' | 'archived',
  });

  useEffect(() => {
    fetchPlans();
  }, [activityId]);

  async function fetchPlans() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans`);
      const json: ApiResponse<PlansData> = await res.json();
      if (json.success) {
        setPlans(json.data.plans);
        setActivityTitle(json.data.activity.title);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      duration_minutes: 60,
      price_type: 'per_person',
      base_price: 0,
      min_participants: 1,
      max_participants: 10,
      booking_type: 'scheduled',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (plan: ActivityPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      duration_minutes: plan.duration_minutes,
      price_type: plan.price_type,
      base_price: plan.base_price,
      min_participants: plan.min_participants,
      max_participants: plan.max_participants,
      booking_type: plan.booking_type,
      status: plan.status,
    });
    setIsModalOpen(true);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingPlan 
      ? `/api/v2/admin/activities/${activityId}/plans/${editingPlan.id}`
      : `/api/v2/admin/activities/${activityId}/plans`;
    
    const method = editingPlan ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json: ApiResponse<any> = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        fetchPlans();
      } else {
        alert(`Error: ${json.error?.message || 'Operation failed'}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('A server error occurred');
    }
  }

  async function handleArchive(planId: string) {
    if (!confirm('Are you sure you want to archive this plan?')) return;

    try {
      const res = await fetch(`/api/v2/admin/activities/${activityId}/plans/${planId}`, {
        method: 'DELETE',
      });
      const json: ApiResponse<any> = await res.json();
      if (json.success) {
        fetchPlans();
      } else {
        alert(`Error: ${json.error?.message || 'Operation failed'}`);
      }
    } catch (error) {
      console.error('Archive error:', error);
      alert('A server error occurred');
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center">Loading activity plans...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button 
            onClick={() => router.back()} 
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center"
          >
            ← Back to Activity
          </button>
          <h1 className="text-2xl font-bold">Plans for {activityTitle}</h1>
        </div>
        <button 
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Create New Plan
        </button>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Pax</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {plans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-400">No plans found for this activity.</td>
              </tr>
            ) : (
              plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{plan.name}</div>
                    <div className="text-xs text-gray-500">{plan.slug}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{plan.duration_minutes} min</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    ${plan.base_price} <span className="text-xs text-gray-400">({plan.price_type.replace('_', ' ')})</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{plan.min_participants} - {plan.max_participants}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{plan.booking_type}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      plan.status === 'active' ? 'bg-green-100 text-green-700' : 
                      plan.status === 'inactive' ? 'bg-yellow-100 text-yellow-700' : 
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {plan.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => openEditModal(plan)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    {plan.status !== 'archived' && (
                      <button 
                        onClick={() => handleArchive(plan.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingPlan ? 'Edit Activity Plan' : 'Create New Activity Plan'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name *</label>
                <input 
                  type="text" 
                  required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min) *</label>
                  <input 
                    type="number" 
                    min="15" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({...formData, duration_minutes: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($) *</label>
                  <input 
                    type="number" 
                    min="0" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.base_price}
                    onChange={(e) => setFormData({...formData, base_price: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Type *</label>
                  <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.price_type}
                    onChange={(e) => setFormData({...formData, price_type: e.target.value as any})}
                  >
                    <option value="per_person">Per Person</option>
                    <option value="per_group">Per Group</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Booking Type *</label>
                  <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.booking_type}
                    onChange={(e) => setFormData({...formData, booking_type: e.target.value as any})}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="request">Request</option>
                    <option value="instant">Instant</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Participants *</label>
                  <input 
                    type="number" 
                    min="1" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.min_participants}
                    onChange={(e) => setFormData({...formData, min_participants: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants *</label>
                  <input 
                    type="number" 
                    min="1" 
                    required 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.max_participants}
                    onChange={(e) => setFormData({...formData, max_participants: parseInt(e.target.value)})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  {editingPlan ? 'Save Changes' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
