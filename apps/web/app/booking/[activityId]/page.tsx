'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────
interface Slot {
  start_at: string;
  end_at: string;
  status: 'available' | 'booked' | 'unavailable';
}

interface Activity {
  id: string;
  slug: string;
  title: string;
  priceTwd: number;
  priceLabel: string;
  durationDisplay: string;
  region: string;
  coverImageUrl?: string;
  refundRules: string[];
  maxParticipants: number;
  minParticipants: number;
  guide?: { displayName?: string } | null;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

// ── BookingInner Component ────────────────────────────────────
function BookingInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activityId = params.activityId as string;

  // --- State ---
  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [guests, setGuests] = useState(2);
  
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  
  const [bookingId, setBookingId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Initialize date and fetch activity
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);

    async function loadActivity() {
      try {
        const res = await fetch(`/api/v2/activities/${activityId}`);
        const json: ApiResponse<Activity> = await res.json();
        if (json.success) {
          setActivity(json.data);
        } else {
          setLoadError(json.error?.message || 'Failed to load activity');
        }
      } catch (e) {
        setLoadError('Network error occurred while loading activity');
      } finally {
        setIsLoading(false);
      }
    }
    loadActivity();
  }, [activityId]);

  // Fetch available slots when date changes
  useEffect(() => {
    if (!selectedDate) return;

    async function fetchSlots() {
      try {
        const res = await fetch(`/api/v2/activities/${activityId}/available-slots?date=${selectedDate}`);
        const json: ApiResponse<{ slots: Slot[] }> = await res.json();
        if (json.success) {
          setAvailableSlots(json.data.slots);
          // Reset selected slot when date changes
          setSelectedSlot(null);
        } else {
          setAvailableSlots([]);
        }
      } catch (e) {
        setAvailableSlots([]);
      }
    }
    fetchSlots();
  }, [selectedDate, activityId]);

  const totalAmount = activity ? activity.priceTwd * guests : 0;

  const canProceedToInfo = Boolean(selectedSlot && guests >= (activity?.minParticipants || 1));
  const canProceedToPayment = Boolean(contactName && contactPhone && contactEmail && agreed);

  // Step 2 -> 3: Create Booking Draft
  async function handleCreateDraft() {
    if (!canProceedToPayment || !selectedSlot) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/v2/bookings/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityId,
          slot: selectedSlot,
          participants: guests,
          contactName,
          contactPhone,
          contactEmail,
          note,
        }),
      });
      const json: ApiResponse<{ bookingId: string }> = await res.json();
      if (json.success) {
        setBookingId(json.data.bookingId);
        setStep(3);
      } else {
        setErrorMessage(json.error?.message || 'Failed to lock this time slot');
      }
    } catch (e) {
      setErrorMessage('A server error occurred while creating the booking');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 3: Finalize Checkout
  async function handleCheckout() {
    if (!bookingId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v2/bookings/${bookingId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'credit_card' }),
      });
      const json: ApiResponse<{ orderId: string }> = await res.json();
      if (json.success) {
        router.push(`/order/success?orderId=${json.data.orderId}`);
      } else {
        setErrorMessage(json.error?.message || 'Payment failed');
      }
    } catch (e) {
      setErrorMessage('A server error occurred during checkout');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <div className="flex justify-center items-center min-h-screen text-gray-500">Loading activity...</div>;
  if (loadError) return <div className="flex flex-col justify-center items-center min-h-screen text-center p-4">
    <h1 className="text-2xl font-bold text-gray-800 mb-2">Activity Not Found</h1>
    <p className="text-gray-600 mb-6">{loadError}</p>
    <Link href="/activities" className="bg-blue-600 text-white px-6 py-2 rounded-lg">Return to Activities</Link>
  </div>;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex mb-8 text-sm text-gray-500">
          <Link href="/activities" className="hover:text-blue-600 transition">Activities</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">{activity?.title}</span>
          <span className="mx-2">/</span>
          <span className="text-blue-600 font-medium">Booking</span>
        </nav>

        {/* Progress Stepper */}
        <div className="flex items-center justify-center mb-12 max-w-2xl mx-auto">
          {[
            { label: 'Select Slot', step: 1 },
            { label: 'Guest Info', step: 2 },
            { label: 'Payment', step: 3 },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition ${
                  step >= s.step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s.step}
                </div>
                <span className={`text-xs mt-2 font-medium ${step >= s.step ? 'text-blue-600' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < 2 && <div className={`flex-1 h-1 mx-4 rounded ${step > s.step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded shadow-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Booking Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* STEP 1: Slot Selection */}
            {step === 1 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-4">Choose Your Slot</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
                      <input 
                        type="date" 
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Guests</label>
                      <input 
                        type="number" 
                        min={activity?.minParticipants || 1}
                        max={activity?.maxParticipants || 20}
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        value={guests}
                        onChange={(e) => setGuests(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Available Time Slots</label>
                  {availableSlots.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                      No available slots for this date. Please try another day.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {availableSlots.map((slot, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-3 rounded-xl text-sm font-medium transition border-2 ${
                            selectedSlot?.start_at === slot.start_at 
                              ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' 
                              : 'border-gray-100 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50'
                          }`}
                        >
                          {new Date(slot.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                          <span className="block text-[10px] opacity-60">to {new Date(slot.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  disabled={!canProceedToInfo}
                  onClick={() => setStep(2)}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-lg shadow-blue-200"
                >
                  Continue to Guest Info →
                </button>
              </div>
            )}

            {/* STEP 2: Guest Information */}
            {step === 2 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Guest Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Full Name *</label>
                    <input 
                      type="text" 
                      required 
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Phone Number *</label>
                    <input 
                      type="tel" 
                      required 
                      className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="0912-345-678"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Email Address *</label>
                  <input 
                    type="email" 
                    required 
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Special Requests (Optional)</label>
                  <textarea 
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Dietary restrictions, accessibility needs, etc."
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span className="text-sm text-gray-600 leading-relaxed">
                    I have read and agree to the <Link href="/legal/terms" className="text-blue-600 hover:underline">Terms of Service</Link> and <Link href="/legal/refund" className="text-blue-600 hover:underline">Refund Policy</Link>.
                  </span>
                </label>
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setStep(1)} 
                    className="flex-1 py-4 px-6 border border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition"
                  >
                    ← Back
                  </button>
                  <button 
                    disabled={!canProceedToPayment || isSubmitting}
                    onClick={handleCreateDraft}
                    className="flex-[2] py-4 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-lg shadow-blue-200"
                  >
                    {isSubmitting ? 'Locking Slot...' : 'Proceed to Payment →'}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Secure Payment</h2>
                <div className="space-y-3">
                  {[
                    { id: 'credit_card', label: 'Credit Card', icon: '💳', desc: 'Visa, Mastercard, JCB' },
                    { id: 'line_pay', label: 'LINE Pay', icon: '📱', desc: 'Instant mobile payment' },
                    { id: 'atm', label: 'ATM Transfer', icon: '🏦', desc: 'Virtual account transfer' },
                  ].map((method) => (
                    <label key={method.id} className="flex items-center p-4 border-2 border-gray-100 rounded-xl cursor-pointer hover:border-blue-200 hover:bg-blue-50 transition group">
                      <input type="radio" name="payment" defaultChecked={method.id === 'credit_card'} className="w-4 h-4 text-blue-600" />
                      <div className="ml-4">
                        <div className="font-bold text-gray-800">{method.icon} {method.label}</div>
                        <div className="text-xs text-gray-500">{method.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-500">Booking Reference</span>
                    <span className="text-sm font-mono font-medium text-gray-800">#{bookingId}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span className="text-gray-800">Total Amount</span>
                    <span className="text-blue-600">NT${totalAmount.toLocaleString()}</span>
                  </div>
                </div>
                <button 
                  disabled={isSubmitting}
                  onClick={handleCheckout}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-lg shadow-blue-200"
                >
                  {isSubmitting ? 'Processing...' : `Pay NT$${totalAmount.toLocaleString()} Now`}
                </button>
                <button 
                  onClick={() => setStep(2)} 
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition"
                >
                  ← Edit Guest Info
                </button>
              </div>
            )}
          </div>

          {/* Right Sticky Summary Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 bg-white p-6 rounded-2xl shadow-md border border-gray-100 space-y-6">
              {activity?.coverImageUrl && (
                <img src={activity.coverImageUrl} alt={activity.title} className="w-full aspect-video object-cover rounded-xl mb-4" />
              )}
              <div>
                <h3 className="text-lg font-bold text-gray-800 leading-tight">{activity?.title}</h3>
                <p className="text-sm text-gray-500 mt-1">📍 {activity?.region} · 🕐 {activity?.durationDisplay}</p>
                {activity?.guide?.displayName && (
                  <p className="text-sm text-gray-500">Guide: {activity.guide.displayName}</p>
                )}
              </div>
              
              <div className="py-4 border-t border-b border-gray-100 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Selected Date</span>
                  <span className="font-medium text-gray-800">{selectedDate || 'Not selected'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Selected Slot</span>
                  <span className="font-medium text-gray-800">
                    {selectedSlot ? `${new Date(selectedSlot.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Not selected'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Guests</span>
                  <span className="font-medium text-gray-800">{guests} persons</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Total</span>
                <span className="text-2xl font-bold text-blue-600">NT${totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen text-gray-500">Loading...</div>}>
      <BookingInner />
    </Suspense>
  );
}
