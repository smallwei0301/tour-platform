'use client';

import Link from 'next/link';
import { useState } from 'react';

export function HeroSection() {
  const [destination, setDestination] = useState('');

  return (
    <section
      className="tp-hero-redesign"
      style={{
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.2)), url(https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80)',
        backgroundSize: 'cover',
        backgroundPosition: 'center 35%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: '120px',
      }}
    >
      <div className="tp-container" style={{ paddingTop: '40px', paddingBottom: '120px' }}>
        {/* Kicker Badge */}
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#F4ECD8',
            color: '#1A2E1F',
            padding: '8px 14px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '20px',
            fontFamily: "'Noto Sans TC', sans-serif",
          }}
        >
          台灣在地導遊平台
        </div>

        {/* Main Headline */}
        <h1
          style={{
            color: '#1A2E1F',
            fontSize: 'clamp(32px, 6vw, 52px)',
            lineHeight: 1.28,
            maxWidth: '680px',
            marginBottom: '20px',
            fontWeight: '700',
            fontFamily: "'Noto Serif TC', serif",
            letterSpacing: '-0.5px',
          }}
        >
          找到懂路的人，
          <br />
          帶你走進台灣最有故事的地方
        </h1>

        {/* Sub-headline */}
        <p
          style={{
            color: '#5E7A4F',
            fontSize: '16px',
            lineHeight: 1.6,
            maxWidth: '580px',
            marginBottom: '32px',
            fontFamily: "'Noto Sans TC', sans-serif",
          }}
        >
          預約在地導遊，用你的節奏認識台灣。
        </p>

        {/* Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: '28px',
            padding: '14px 20px',
            marginBottom: '24px',
            maxWidth: '600px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1A2E1F"
            strokeWidth="2"
            style={{ marginRight: '12px' }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="想去哪裡？"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              flex: 1,
              fontSize: '16px',
              color: '#1A2E1F',
              fontFamily: "'Noto Sans TC', sans-serif",
            }}
          />
        </div>

        {/* CTA Button */}
        <button
          style={{
            backgroundColor: '#D97836',
            color: '#fff',
            border: 'none',
            padding: '14px 32px',
            borderRadius: '28px',
            fontSize: '18px',
            fontWeight: '700',
            cursor: 'pointer',
            width: '100%',
            maxWidth: '600px',
            fontFamily: "'Noto Sans TC', sans-serif",
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#C2542E')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#D97836')}
        >
          開始找行程
        </button>
      </div>
    </section>
  );
}
