import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ onRefresh, children }) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop === 0 && startYRef.current) {
      const distance = e.touches[0].clientY - startYRef.current;
      if (distance > 0) {
        e.preventDefault();
        setPullDistance(distance);
        setIsPulling(distance > 60);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (isPulling) {
      setPullDistance(60);
      await onRefresh();
      setTimeout(() => {
        setPullDistance(0);
        setIsPulling(false);
      }, 600);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
    startYRef.current = 0;
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="overscroll-none min-h-full"
      style={{
        WebkitOverscrollBehavior: 'none',
        overscrollBehavior: 'none'
      }}
    >
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center bg-stone-100 overflow-hidden transition-all"
          style={{ height: `${Math.min(pullDistance, 60)}px` }}
        >
          <RefreshCw
            className={`w-4 h-4 text-[#82bb32] ${isPulling ? 'animate-spin' : ''}`}
          />
        </div>
      )}
      {children}
    </div>
  );
}