import React, { useState, useRef, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

export default function LocationEditor({ visit, onSaved, className = '' }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(visit?.location || '');
    const inputRef = useRef(null);
    const savingRef = useRef(false);
    const cancelledRef = useRef(false);

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
        // Enter saves and then the input blurs, which would save a second time.
        // Escape also blurs, and must not save.
        if (savingRef.current || cancelledRef.current) { cancelledRef.current = false; return; }
        setEditing(false);
        const trimmed = value.slice(0, 10);
        setValue(trimmed);
        if (trimmed === (visit?.location || '')) return;
        savingRef.current = true;
        try {
            await base44.entities.Visit.update(visit.id, { location: trimmed });
            onSaved?.(trimmed);
        } catch (err) {
            console.error('Location save failed', err);
            setValue(visit?.location || ''); // put the old location back
            toast({ variant: 'destructive', title: 'Location not saved', description: 'Please try again.' });
        } finally {
            savingRef.current = false;
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            cancelledRef.current = true;
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