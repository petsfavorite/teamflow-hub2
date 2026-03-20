import React, { useState, useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function LocationEditor({ visit, onSaved, className = '' }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(visit?.location || '');
    const inputRef = useRef(null);

    useEffect(() => {
        setValue(visit?.location || '');
    }, [visit?.location]);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleSave = async () => {
        setEditing(false);
        const trimmed = value.slice(0, 10);
        setValue(trimmed);
        if (trimmed === (visit?.location || '')) return;
        await base44.entities.Visit.update(visit.id, { location: trimmed });
        onSaved?.(trimmed);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setValue(visit?.location || '');
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, 10))}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                maxLength={10}
                className={`text-sm font-medium border border-[#82bb32] rounded px-1.5 py-0.5 w-24 outline-none bg-white ${className}`}
                onClick={(e) => e.stopPropagation()}
            />
        );
    }

    return (
        <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className={`flex items-center gap-1 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-[#82bb32]/10 hover:text-[#82bb32] px-2 py-0.5 rounded transition-colors ${className}`}
            title="Click to edit location"
        >
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>{visit?.location || 'Set location'}</span>
        </button>
    );
}