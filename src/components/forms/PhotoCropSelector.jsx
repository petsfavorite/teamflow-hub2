import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PhotoCropSelector({ photoUrl, onConfirm, onCancel }) {
    const [offsetY, setOffsetY] = useState(0);
    const containerRef = useRef(null);
    const imageRef = useRef(null);

    useEffect(() => {
        const image = imageRef.current;
        if (image) {
            image.onload = () => {
                // Initialize to show center of image
                const maxOffset = Math.max(0, image.naturalHeight - 160);
                setOffsetY(maxOffset / 2);
            };
        }
    }, [photoUrl]);

    const handleMove = (direction) => {
        if (!imageRef.current) return;
        const maxOffset = Math.max(0, imageRef.current.naturalHeight - 160);
        const step = 10;
        
        if (direction === 'up') {
            setOffsetY(prev => Math.max(0, prev - step));
        } else {
            setOffsetY(prev => Math.min(maxOffset, prev + step));
        }
    };

    const handleDrag = (e) => {
        if (e.type === 'touchmove' || e.type === 'mousemove') {
            if (!containerRef.current || !imageRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const y = e.touches ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
            const maxOffset = Math.max(0, imageRef.current.naturalHeight - 160);
            const newOffset = Math.max(0, Math.min(maxOffset, y - 80));
            setOffsetY(newOffset);
        }
    };

    return (
        <div className="space-y-4">
            <div 
                ref={containerRef}
                className="relative w-full h-40 bg-stone-100 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing border-2 border-stone-200"
                onMouseMove={handleDrag}
                onTouchMove={handleDrag}
            >
                <img
                    ref={imageRef}
                    src={photoUrl}
                    alt="Crop preview"
                    className="w-full h-full object-cover"
                    style={{
                        objectPosition: `center ${-offsetY}px`,
                    }}
                />
                <div className="absolute inset-0 border-4 border-emerald-400 pointer-events-none" />
            </div>

            <div className="flex items-center justify-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove('up')}
                    className="rounded-lg"
                >
                    <ChevronUp className="w-4 h-4" />
                </Button>
                <span className="text-xs text-stone-600">Drag or use arrows</span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleMove('down')}
                    className="rounded-lg"
                >
                    <ChevronDown className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    className="flex-1 rounded-xl"
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={() => onConfirm({ photo_url: photoUrl, crop_offset_y: offsetY })}
                    className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600"
                >
                    Confirm
                </Button>
            </div>
        </div>
    );
}